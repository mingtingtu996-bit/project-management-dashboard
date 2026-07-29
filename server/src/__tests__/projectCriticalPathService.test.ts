import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

function productionDayMetric(value: number | null) {
  return {
    value,
    unit: 'construction_production_day' as const,
    calendarRef: null,
    calendarVersion: null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-14',
    availability: 'unavailable' as const,
    unavailableReason: 'construction_calendar_identity_missing',
  }
}

function availableProductionDayMetric(value: number, override: Record<string, unknown> = {}) {
  return {
    value,
    unit: 'construction_production_day' as const,
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-14',
    availability: 'available' as const,
    unavailableReason: null,
    ...override,
  }
}

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    tasks: [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        standard_work_code: 'SW-A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        standard_work_code: 'SW-B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        standard_work_code: 'SW-C',
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
    duration_learning_runtime_publications: [],
    projects: [{ id: 'project-1', company_id: 'company-1', project_type: 'residential' }],
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

    if (sql.startsWith('select') && sql.includes('from public.duration_learning_runtime_publications')) {
      return tables.duration_learning_runtime_publications
        .filter((row) => row.asset_key === params[0])
        .map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from public.projects')) {
      return tables.projects
        .filter((row) => row.id === params[0])
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

  const rawQuery = vi.fn(async (query: string, params: any[] = []) => {
    const sql = query.trim().toLowerCase()
    if (sql.startsWith('with projection as') && sql.includes('jsonb_to_recordset') && sql.includes('update tasks')) {
      updates.push({ sql: query, params })
      const updatedAt = params[0]
      const projectionRows = JSON.parse(params[1]) as Array<{
        task_id: string
        is_critical: boolean
        total_float_days: number
        free_float_days: number
        criticality_weight: number
      }>
      const projectId = params[2]
      for (const projection of projectionRows) {
        const row = tables.tasks.find((task) => task.id === projection.task_id && task.project_id === projectId)
        if (row) {
          row.is_critical = projection.is_critical
          row.total_float_days = projection.total_float_days
          row.free_float_days = projection.free_float_days
          row.criticality_weight = projection.criticality_weight
          row.updated_at = updatedAt
        }
      }
      return { rows: [] as Row[] }
    }

    return { rows: [] as Row[] }
  })
  const clientQuery = vi.fn(async (query: string, params: any[] = []) => {
    return await rawQuery(query, params)
  })
  const clientRelease = vi.fn()
  const getClient = vi.fn(async () => ({
    query: clientQuery,
    release: clientRelease,
  }))

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
    listCurrentExecutionFacts: vi.fn(async () => []),
    listCurrentTaskDurationForecasts: vi.fn(),
    resolveConstructionCalendarContext: vi.fn(),
    readLiveProjectGenerationFacts: vi.fn(),
    rawQuery,
    clientQuery,
    clientRelease,
    getClient,
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
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

vi.mock('../services/executionFactGovernanceService.js', () => ({
  listCurrentExecutionFacts: mocks.listCurrentExecutionFacts,
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

vi.mock('../services/projectGenerationFactsStoreService.js', () => ({
  readLiveProjectGenerationFacts: mocks.readLiveProjectGenerationFacts,
}))

const {
  buildProjectCriticalPathSnapshot,
  clearProjectCriticalPathSnapshotCache,
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  evaluateCriticalPathRuleCandidateLiveLearningEvidence,
  getProjectCriticalPathSnapshot,
  listCriticalPathOverrides,
  recalculateProjectCriticalPath,
} = await import('../services/projectCriticalPathService.js')

function useAuthoritativeConstructionCalendar() {
  mocks.resolveConstructionCalendarContext.mockResolvedValue({
    basis: 'official_construction_calendar_seed',
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    availability: 'available',
    unavailableReason: null,
    windows: [],
  })
}

describe('project critical path service', () => {
  beforeEach(() => {
    clearProjectCriticalPathSnapshotCache()
    vi.clearAllMocks()
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        standard_work_code: 'SW-A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        standard_work_code: 'SW-B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        standard_work_code: 'SW-C',
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
    mocks.tables.duration_learning_runtime_publications = []
    mocks.tables.projects = [{ id: 'project-1', company_id: 'company-1', project_type: 'residential' }]
    mocks.updates.length = 0
    mocks.recordDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.recordDurationAccuracyBacktest.mockResolvedValue(null)
    mocks.backtestEarliestPendingDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.listCurrentExecutionFacts.mockResolvedValue([])
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([])
    mocks.resolveConstructionCalendarContext.mockResolvedValue({ basis: 'calendar_day', windows: [] })
    mocks.readLiveProjectGenerationFacts.mockResolvedValue({})
  })

  it('recomputes critical tasks from CPM without reading legacy task flags', async () => {
    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.projectId).toBe('project-1')
    expect(result.criticalTaskIds).toEqual(['task-b'])
    expect(result.projectDuration).toBe(8)
    expect(result.snapshot.autoTaskIds).toEqual(['task-b'])
  })

  it('fails closed for project, task, chain and network production-day metrics without calendar identity', async () => {
    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.projectDuration).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
    expect(snapshot.primaryChain?.totalDuration).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
    }))
    expect(snapshot.tasks[0]).toEqual(expect.objectContaining({
      floatDays: null,
      freeFloatDays: null,
      duration: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
      float: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
      freeFloat: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
    }))
    expect(snapshot.networkSchedule?.[0]).toEqual(expect.objectContaining({
      floatDays: null,
      freeFloatDays: null,
      duration: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
      float: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
      freeFloat: expect.objectContaining({ value: null, unit: 'construction_production_day', availability: 'unavailable' }),
    }))
  })

  it('does not persist production-day learning evidence without authoritative calendar identity', async () => {
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.end_date,
    }))

    await recalculateProjectCriticalPath('project-1')

    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
    expect(mocks.rawQuery.mock.calls.some((call) => (
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes')
    ))).toBe(false)
  })

  it('uses current execution facts instead of stale task compatibility columns for completed outcomes', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      status: row.id === 'task-b' ? 'todo' : 'completed',
      progress: row.id === 'task-b' ? 0 : 100,
      actual_start_date: row.id === 'task-b' ? null : row.start_date,
      actual_end_date: row.id === 'task-b' ? null : row.end_date,
    }))
    mocks.listCurrentExecutionFacts.mockResolvedValue([
      { entityType: 'task', entityId: 'task-b', factType: 'task.status', value: 'completed' },
      { entityType: 'task', entityId: 'task-b', factType: 'task.progress', value: 100 },
      { entityType: 'task', entityId: 'task-b', factType: 'task.actual_start_date', value: '2026-04-01' },
      { entityType: 'task', entityId: 'task-b', factType: 'task.actual_end_date', value: '2026-04-08' },
    ])

    await recalculateProjectCriticalPath('project-1')

    expect(mocks.listCurrentExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      entityType: 'task',
      entityIds: ['task-a', 'task-b', 'task-c'],
      factTypes: [
        'task.actual_start_date',
        'task.actual_end_date',
        'task.first_progress_at',
        'task.progress',
        'task.status',
      ],
    }))
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      actualStartDate: '2026-04-01',
      actualFinishDate: '2026-04-08',
      actualDurationDays: 8,
    }))
  })

  it('uses a published critical-path rule as a watched-task prior without rewriting CPM facts', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = mocks.tables.tasks.map((task) => task.id === 'task-a'
      ? { ...task, standard_work_code: 'SW-LEARNED-WATCH' }
      : task)
    mocks.tables.duration_learning_runtime_publications = [{
      publication_key: 'duration_learning_runtime:critical_path_rule_candidate:global-watch-v1',
      asset_key: 'critical_path_rule_candidate',
      artifact_key: 'critical-watch-v1',
      scope_level: 'global',
      company_id: null,
      project_id: null,
      industry_key: null,
      publication_stage: 'stable',
      runtime_payload: {
        criticalStableCodes: ['SW-LEARNED-WATCH'],
        watchReason: 'historically_near_critical',
      },
      previous_publication_key: null,
      traffic_percent: 100,
      monitoring_status: 'passed',
      published_at: '2026-07-17T00:00:00.000Z',
    }]

    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.snapshot.autoTaskIds).toEqual(['task-b'])
    expect(result.snapshot.displayTaskIds).toEqual(['task-b'])
    expect(result.snapshot.watchedTaskIds).toEqual(['task-a'])
    expect(result.snapshot.tasks.find((task) => task.taskId === 'task-a')).toEqual(expect.objectContaining({
      isAutoCritical: false,
      isLearnedCriticalPathWatch: true,
      durationLearningPublicationKeys: [
        'duration_learning_runtime:critical_path_rule_candidate:global-watch-v1',
      ],
    }))
    expect((result.snapshot as any).criticalPathLearningPublications).toEqual([
      expect.objectContaining({
        publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:global-watch-v1',
        inputTaskIds: ['task-a'],
        appliedTaskIds: ['task-a'],
      }),
    ])
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'critical_path_cpm',
      predictionContext: expect.objectContaining({
        runtimePublicationKeys: [
          'duration_learning_runtime:critical_path_rule_candidate:global-watch-v1',
        ],
        criticalPathLearningPublications: [
          expect.objectContaining({
            publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:global-watch-v1',
            role: 'watched_task_prior',
          }),
        ],
      }),
    }))
    expect(mocks.executeSQL.mock.calls.some((call) => (
      String(call[0]).includes('runtime_consumer_observations')
      && call[1]?.[0] === 'critical_path_rule_candidate'
    ))).toBe(true)
  })

  it('propagates effective duration publication receipts into CPM while keeping candidates evidence-only', async () => {
    mocks.readLiveProjectGenerationFacts.mockResolvedValue({
      wizard_generation_duration_asset_consumption_receipts: [
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
          targetRowIds: ['task-b'],
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
      ],
    })

    const result = await recalculateProjectCriticalPath('project-1')
    const assembly = result.snapshot.durationInputAssembly as any

    expect(assembly.assetConsumptionReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumer: 'critical_path_cpm',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
        changedFields: expect.arrayContaining(['task_selection', 'duration', 'dependency']),
      }),
      expect.objectContaining({
        consumer: 'critical_path_cpm',
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'evidence_only',
        changedFields: [],
      }),
    ]))
    expect(assembly.assetConsumptionSummary).toEqual(expect.objectContaining({
      effectiveAppliedCount: 1,
      evidenceOnlyCount: 1,
    }))
  })

  it('filters non-duration semantic rows from CPM nodes and converts external waits into dependency lag', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A physical work',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'wait-a-b',
        project_id: 'project-1',
        title: 'External utility wait',
        start_date: '2026-04-04',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'external_wait',
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B physical work',
        start_date: '2026-04-09',
        end_date: '2026-04-10',
        planned_end_date: '2026-04-10',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'record-only',
        project_id: 'project-1',
        title: 'Record only closeout',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        planned_end_date: '2026-04-30',
        duration_contribution_mode: 'record_only',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-wait-a',
        project_id: 'project-1',
        task_id: 'wait-a-b',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-b-wait',
        project_id: 'project-1',
        task_id: 'task-b',
        dependency_task_id: 'wait-a-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.snapshot.tasks.map((task) => task.taskId)).not.toContain('wait-a-b')
    expect(result.snapshot.tasks.map((task) => task.taskId)).not.toContain('record-only')
    expect(result.snapshot.autoTaskIds).toEqual(['task-a', 'task-b'])
    expect(result.projectDuration).toBe(10)
    expect(result.snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromTaskId: 'task-a',
        toTaskId: 'task-b',
        dependencyType: 'FS',
        lagDays: 5,
      }),
    ]))
  })

  it('uses the same semantic dependency input for recalc failure notification and authoritative snapshot', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-semantic-cycle',
        title: 'A physical work',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'task-b',
        project_id: 'project-semantic-cycle',
        title: 'B physical work',
        start_date: '2026-04-03',
        end_date: '2026-04-04',
        planned_end_date: '2026-04-04',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'wait-a-to-b',
        project_id: 'project-semantic-cycle',
        title: 'External wait A to B',
        start_date: '2026-04-05',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        duration_contribution_mode: 'external_wait',
      },
      {
        id: 'wait-b-to-a',
        project_id: 'project-semantic-cycle',
        title: 'External wait B to A',
        start_date: '2026-04-07',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'external_wait',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-wait-a-in',
        project_id: 'project-semantic-cycle',
        task_id: 'wait-a-to-b',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-wait-a-out',
        project_id: 'project-semantic-cycle',
        task_id: 'task-b',
        dependency_task_id: 'wait-a-to-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-wait-b-in',
        project_id: 'project-semantic-cycle',
        task_id: 'wait-b-to-a',
        dependency_task_id: 'task-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-wait-b-out',
        project_id: 'project-semantic-cycle',
        task_id: 'task-a',
        dependency_task_id: 'wait-b-to-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const result = await recalculateProjectCriticalPath('project-semantic-cycle')

    expect(result.snapshot.calculationStatus).toBe('empty_after_failure')
    expect(result.snapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[projectCriticalPathService] recalculation CPM failed, snapshot metadata will indicate stale or empty data',
      expect.objectContaining({
        projectId: 'project-semantic-cycle',
        error: expect.stringContaining('CRITICAL_PATH_CYCLE_DETECTED'),
      }),
    )
  })

  it('keeps CPM production task loading wired to semantic duration contribution fields', () => {
    const source = readFileSync(resolve(__dirname, '..', 'services', 'projectCriticalPathService.ts'), 'utf8')

    expect(source).toContain('duration_contribution_mode')
    expect(source).toContain('NULL::jsonb AS metadata, NULL::jsonb AS standard_task_metadata')
    expect(source).not.toContain('standard_task_metadata AS metadata')
    expect(source).not.toContain('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC')
    expect(source).toContain('readCriticalPathDurationContributionMode')
    expect(source).toContain('buildSemanticDependencyRowsForCriticalPath')
    expect(source).toContain("'external_wait'")
    expect(source).toContain("'record_only'")
    expect(source).toContain("'embedded_check'")
    expect(source).toContain("'handover_marker'")
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
          totalDuration: productionDayMetric(null),
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
          float: productionDayMetric(null),
          durationDays: 8,
          duration: productionDayMetric(null),
          freeFloat: productionDayMetric(null),
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
        }],
        projectDurationDays: 8,
        projectDuration: productionDayMetric(null),
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
        projectDuration: productionDayMetric(null),
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
    useAuthoritativeConstructionCalendar()
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
    expect(result.snapshot.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
      inputChannels: expect.objectContaining({
        criticalPathEvidence: expect.objectContaining({
          source: 'explicit_input',
          status: 'ready',
          assetSource: 'critical_path_cpm',
        }),
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
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
        durationInputAssembly: expect.objectContaining({
          source: 'duration_input_assembler',
        }),
        networkLineage: expect.objectContaining({
          criticalSetHash: expect.stringMatching(/^sha256:/),
        }),
      }),
    }))
  })

  it('records construction organization plan-network publication lineage on E3 CPM prediction events', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.task_dependencies = [
      ...mocks.tables.task_dependencies,
      {
        id: 'dep-task-b-task-c-construction-org',
        project_id: 'project-1',
        task_id: 'task-b',
        dependency_task_id: 'task-c',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
        source_type: 'construction_organization_plan_network',
        metadata: {
          source: 'construction_organization_plan_network_domain_writer',
          publicationKey: 'construction-org-plan-network-release:project-1',
          businessType: 'residential',
          draftNetworkKey: 'draft-project-1-recommended',
          optionId: 'option-project-1-recommended',
        },
      },
    ]

    await recalculateProjectCriticalPath('project-1')

    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'critical_path_cpm',
      predictionContext: expect.objectContaining({
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
      networkLineage: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        businessType: 'residential',
        draftNetworkKey: 'draft-project-1-recommended',
        optionId: 'option-project-1-recommended',
      }),
    }))
  })

  it('carries construction organization plan-network lineage into completed CPM backtests', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.task_dependencies = [
      ...mocks.tables.task_dependencies,
      {
        id: 'dep-task-b-task-c-construction-org',
        project_id: 'project-1',
        task_id: 'task-b',
        dependency_task_id: 'task-c',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
        source_type: 'construction_organization_plan_network',
        metadata: {
          source: 'construction_organization_plan_network_domain_writer',
          publicationKey: 'construction-org-plan-network-release:project-1',
          businessType: 'residential',
          draftNetworkKey: 'draft-project-1-recommended',
          optionId: 'option-project-1-recommended',
        },
      },
    ]
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.end_date,
    }))

    await recalculateProjectCriticalPath('project-1')

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'critical_path_cpm',
      actualContext: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        runtimePublicationKey: 'construction-org-plan-network-release:project-1',
        businessType: 'residential',
        draftNetworkKey: 'draft-project-1-recommended',
        optionId: 'option-project-1-recommended',
      }),
    }))
  })

  it('closes the earliest pending CPM prediction instead of the current recalculation key when the project is complete', async () => {
    useAuthoritativeConstructionCalendar()
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
    useAuthoritativeConstructionCalendar()
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
    expect(String(outcomeInsert?.[0]).toLowerCase()).toContain('learning_scope_source')
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
      'project_business_outcome_writer',
      'company-1',
      'project-1',
      null,
      expect.objectContaining({
        source: 'project_critical_path_cpm',
        algorithm_version: 'critical_path_cpm_v1',
        duration_day_unit: 'construction_production_day',
        construction_calendar: {
          basis: 'official_construction_calendar_seed',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          availability: 'available',
          unavailableReason: null,
          windows: [],
        },
        prediction_duration_days: 8,
        actual_duration_days: 8,
        duration_error_days: 0,
        outcome_tolerance_days: 2,
        critical_task_count: 1,
        auto_task_stable_codes: ['SW-B'],
        primary_chain_stable_codes: ['SW-B'],
        projected_float_task_count: 1,
        sample_count: 1,
        source_evidence_refs: expect.arrayContaining([
          expect.stringMatching(/^critical_path_inputs:sha256:/),
          'tasks:task-b:completed_cpm_replay',
        ]),
        task_ids: ['task-b'],
        real_outcome_count: 1,
        replay_case_count: 1,
        observation_started_at: '2026-04-01',
        observation_ended_at: '2026-04-08',
        observation_window_days: 8,
        quality_model: 'structural_replay',
        replay_pass_rate: 1,
        outcome_acceptance_rate: 1,
        quality_consistency_rate: 1,
        conflict_rate: 0,
        rollback_ready: true,
        tenant_scope_valid: true,
        writes_runtime_directly: false,
        writes_fact_directly: false,
      }),
      false,
      false,
    ])
  })

  it('counts one completed project network as one replay outcome while retaining all distinct task ids', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      end_date: row.id === 'task-c' ? '2026-04-10' : row.end_date,
      planned_end_date: row.id === 'task-c' ? '2026-04-10' : row.planned_end_date,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.id === 'task-c' ? '2026-04-10' : row.end_date,
    }))

    await recalculateProjectCriticalPath('project-1')

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(metadata.task_ids).toEqual(expect.arrayContaining(['task-a', 'task-c']))
    expect((metadata.task_ids as string[]).length).toBeGreaterThan(1)
    expect(metadata.sample_count).toBe(1)
    expect(metadata.real_outcome_count).toBe(1)
    expect(metadata.replay_case_count).toBe(1)
  })

  it('records completed critical-path impact against the exact consumed publication, artifact, and input tasks', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      standard_work_code: row.id === 'task-b' ? 'SW-LEARNED-CRITICAL' : row.standard_work_code,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.end_date,
    }))
    mocks.tables.duration_learning_runtime_publications = [{
      publication_key: 'duration_learning_runtime:critical_path_rule_candidate:exact-v1',
      asset_key: 'critical_path_rule_candidate',
      artifact_key: 'critical-watch-exact-v1',
      scope_level: 'global',
      company_id: null,
      project_id: null,
      industry_key: null,
      publication_stage: 'stable',
      runtime_payload: { criticalStableCodes: ['SW-LEARNED-CRITICAL'] },
      previous_publication_key: null,
      traffic_percent: 100,
      monitoring_status: 'passed',
      published_at: '2026-07-17T00:00:00.000Z',
    }]

    await recalculateProjectCriticalPath('project-1')

    const linkedOutcome = mocks.rawQuery.mock.calls.find((call) => (
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes')
      && call[1]?.[8] === 'duration_learning_runtime:critical_path_rule_candidate:exact-v1'
    ))
    expect(linkedOutcome).toBeTruthy()
    expect(linkedOutcome?.[1]?.[2]).toBe('accepted')
    expect(linkedOutcome?.[1]?.[6]).toBe('company-1')
    expect(linkedOutcome?.[1]?.[9]).toEqual(expect.objectContaining({
      runtime_publication_key: 'duration_learning_runtime:critical_path_rule_candidate:exact-v1',
      runtime_publication_artifact_key: 'critical-watch-exact-v1',
      runtime_publication_input_task_ids: ['task-b'],
      critical_path_input_hash: expect.stringMatching(/^sha256:/),
    }))
    const observationInsert = mocks.executeSQL.mock.calls.find((call) => (
      String(call[0]).toLowerCase().includes('insert into public.runtime_consumer_observations')
      && call[1]?.[1] === 'duration_learning_runtime:critical_path_rule_candidate:exact-v1'
    ))
    expect(observationInsert).toBeTruthy()
    expect(observationInsert?.[1]?.[5]).toEqual(expect.objectContaining({
      criticalPathInputHash: expect.stringMatching(/^sha256:/),
      taskNetworkInputHash: expect.stringMatching(/^sha256:/),
    }))
    expect(observationInsert?.[1]?.[6]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^critical_path_inputs:sha256:/),
    ]))
  })

  it('projects live CPM criticality and float fields back to task rows after recalculation', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
      windows: [],
    })

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
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0].sql.toLowerCase()).toContain('jsonb_to_recordset')
    expect(mocks.updates[0].sql.toLowerCase()).toContain('update tasks as t')
    expect(mocks.updates[0].sql.toLowerCase()).toContain('where t.project_id = $3')
    expect(mocks.updates[0].sql.toLowerCase()).toContain('t.id::text = projection.task_id')
    expect(JSON.parse(mocks.updates[0].params[1])).toEqual([
      expect.objectContaining({ task_id: 'task-a', is_critical: false, total_float_days: 2 }),
      expect.objectContaining({ task_id: 'task-b', is_critical: true, total_float_days: 0 }),
      expect.objectContaining({ task_id: 'task-c', is_critical: false, total_float_days: 2 }),
    ])
  })

  it('persists null raw float projection aliases when calendar identity is unavailable', async () => {
    await recalculateProjectCriticalPath('project-1')

    expect(mocks.tables.tasks.find((row) => row.id === 'task-a')).toEqual(expect.objectContaining({
      is_critical: false,
      total_float_days: null,
      free_float_days: null,
    }))
    expect(mocks.tables.tasks.find((row) => row.id === 'task-b')).toEqual(expect.objectContaining({
      is_critical: true,
      total_float_days: null,
      free_float_days: null,
    }))
    expect(mocks.tables.tasks.find((row) => row.id === 'task-c')).toEqual(expect.objectContaining({
      is_critical: false,
      total_float_days: null,
      free_float_days: null,
    }))
    expect(mocks.updates).toHaveLength(1)
  })

  it('uses E2 remaining-duration forecasts for in-progress CPM task nodes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
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
        remainingDuration: {
          value: 2,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-06-14',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: '2026-06-12',
      },
    ])

    try {
      const result = await recalculateProjectCriticalPath('project-runtime')

      expect(mocks.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(
        ['task-running', 'task-successor'],
        expect.any(Object),
      )
      expect(result.projectDuration).toBe(7)
      expect(result.snapshot.tasks.find((task) => task.taskId === 'task-running')?.durationDays).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a raw E2 remaining-duration alias when the typed fact is unavailable', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
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
    ]
    mocks.tables.task_dependencies = []
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-running',
        remainingDurationDays: 2,
        remainingDuration: {
          value: null,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-06-14',
          availability: 'unavailable',
          unavailableReason: 'duration_value_missing',
        },
      },
    ])

    try {
      const result = await recalculateProjectCriticalPath('project-runtime')

      expect(result.projectDuration).toBe(10)
      expect(result.snapshot.tasks.find((task) => task.taskId === 'task-running')?.durationDays).toBe(10)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['wrong unit', { unit: 'calendar_day' }],
    ['wrong calendar ref', { calendarRef: 'other_calendar' }],
    ['wrong calendar version', { calendarVersion: 'calendar-v2' }],
    ['wrong timezone', { timezone: 'UTC' }],
    ['stale asOf', { asOf: '2026-06-13' }],
  ])('rejects E2 remaining duration with %s', async (_label, override) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = [{
      id: 'task-running',
      project_id: 'project-runtime-identity',
      title: 'Running structure work',
      start_date: '2026-06-01',
      end_date: '2026-06-10',
      planned_end_date: '2026-06-10',
      status: 'in_progress',
      progress: 70,
      actual_start_date: '2026-06-01',
    }]
    mocks.tables.task_dependencies = []
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([{
      taskId: 'task-running',
      remainingDurationDays: 2,
      remainingDuration: availableProductionDayMetric(2, override),
    }])

    try {
      const result = await recalculateProjectCriticalPath('project-runtime-identity')

      expect(result.projectDuration).toBe(10)
      expect(result.snapshot.tasks.find((task) => task.taskId === 'task-running')?.durationDays).toBe(10)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flags high-variance near-critical chains from E2 probability duration windows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
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
        remainingDuration: {
          value: 10,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-06-14',
          availability: 'available',
          unavailableReason: null,
        },
        probabilityDuration: {
          p50RemainingDays: 10,
          p80RemainingDays: 11,
          standardDeviationDays: 1,
          confidenceBandWidthDays: 1,
        },
        probabilityDurationMetrics: {
          p20RemainingDuration: {
            value: 9,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
          p50RemainingDuration: {
            value: 10,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
          p80RemainingDuration: {
            value: 11,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
        },
      },
      {
        taskId: 'near-critical-variable',
        remainingDurationDays: 9,
        remainingDuration: {
          value: 9,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-06-14',
          availability: 'available',
          unavailableReason: null,
        },
        probabilityDuration: {
          p50RemainingDays: 9,
          p80RemainingDays: 16,
          standardDeviationDays: 4,
          confidenceBandWidthDays: 7,
        },
        probabilityDurationMetrics: {
          p20RemainingDuration: {
            value: 7,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
          p50RemainingDuration: {
            value: 9,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
          p80RemainingDuration: {
            value: 16,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-14',
            availability: 'available',
            unavailableReason: null,
          },
        },
      },
    ])

    try {
      const snapshot = await getProjectCriticalPathSnapshot('project-variance')

      const nearCriticalTask = snapshot.tasks.find((task) => task.taskId === 'near-critical-variable') as any
      expect(nearCriticalTask).toEqual(expect.objectContaining({
        isAutoCritical: false,
        isHighVarianceNearCritical: true,
        p80DurationDays: 16,
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
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not flag high-variance chains from legacy probability fields when typed metrics are unavailable', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = [
      {
        id: 'main-critical',
        project_id: 'project-variance-unavailable',
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
        project_id: 'project-variance-unavailable',
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
        probabilityDuration: { p50RemainingDays: 10, p80RemainingDays: 11 },
        probabilityDurationMetrics: {
          p20RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
          p50RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
          p80RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
        },
      },
      {
        taskId: 'near-critical-variable',
        probabilityDuration: { p50RemainingDays: 9, p80RemainingDays: 30, confidenceBandWidthDays: 21 },
        probabilityDurationMetrics: {
          p20RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
          p50RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
          p80RemainingDuration: { value: null, unit: 'construction_production_day', availability: 'unavailable' },
        },
      },
    ] as any)

    try {
      const snapshot = await getProjectCriticalPathSnapshot('project-variance-unavailable')

      expect(snapshot.tasks.find((task) => task.taskId === 'near-critical-variable')).not.toEqual(expect.objectContaining({
        isHighVarianceNearCritical: true,
      }))
      expect(snapshot.alternateChains).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ taskIds: ['near-critical-variable'], isHighVarianceNearCritical: true }),
      ]))
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['P20 exceeds P50', 16, 9, 30],
    ['P50 exceeds P80', 7, 16, 15],
  ])('does not publish or arbitrate inverted typed probability percentiles when %s', async (_label, p20, p50, p80) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = [
      {
        id: 'main-critical',
        project_id: 'project-variance-inverted',
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
        project_id: 'project-variance-inverted',
        title: 'Near critical invalid percentile work',
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
        remainingDuration: availableProductionDayMetric(10),
      },
      {
        taskId: 'near-critical-variable',
        remainingDuration: availableProductionDayMetric(9),
        probabilityDuration: {
          p50RemainingDays: 9,
          p80RemainingDays: 30,
          confidenceBandWidthDays: 21,
        },
        probabilityDurationMetrics: {
          p20RemainingDuration: availableProductionDayMetric(p20),
          p50RemainingDuration: availableProductionDayMetric(p50),
          p80RemainingDuration: availableProductionDayMetric(p80),
        },
      },
    ] as any)

    try {
      const snapshot = await getProjectCriticalPathSnapshot('project-variance-inverted')
      const task = snapshot.tasks.find((item) => item.taskId === 'near-critical-variable') as any

      expect(task).toBeUndefined()
      expect(snapshot.alternateChains).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ taskIds: ['near-critical-variable'], isHighVarianceNearCritical: true }),
      ]))
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses construction production days for planned CPM task durations', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
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

    const result = await recalculateProjectCriticalPath('project-1')
    const snapshot = result.snapshot

    expect(snapshot.tasks.find((task) => task.taskId === 'task-calendar')?.durationDays).toBe(3)
    expect(snapshot.projectDurationDays).toBe(3)
    expect(snapshot.projectDuration).toEqual(expect.objectContaining({
      value: 3,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
    }))
    expect(snapshot.tasks.find((task) => task.taskId === 'task-calendar')).toEqual(expect.objectContaining({
      duration: expect.objectContaining({ value: 3, unit: 'construction_production_day', availability: 'available' }),
      float: expect.objectContaining({ unit: 'construction_production_day', availability: 'available' }),
      freeFloat: expect.objectContaining({ unit: 'construction_production_day', availability: 'available' }),
    }))
    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 3,
      predictionContext: expect.objectContaining({
        durationDayUnit: 'construction_production_day',
        constructionCalendar: expect.objectContaining({
          basis: 'official_construction_calendar_seed',
          windows: expect.arrayContaining([
            expect.objectContaining({
              startDate: '2026-02-03',
              endDate: '2026-02-04',
              shutdown: true,
            }),
          ]),
        }),
      }),
    }))
  })

  it('isolates nested production-day metrics from cached CPM snapshots', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
      windows: [],
    })
    mocks.tables.tasks = [
      {
        id: 'cache-primary',
        project_id: 'project-1',
        title: 'Cache primary',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
      {
        id: 'cache-alternate',
        project_id: 'project-1',
        title: 'Cache alternate',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
    ]
    mocks.tables.task_dependencies = []

    const first = await getProjectCriticalPathSnapshot('project-1')
    const expected = {
      project: first.projectDuration.value,
      primary: first.primaryChain?.totalDuration?.value,
      alternate: first.alternateChains[0]?.totalDuration?.value,
      taskDuration: first.tasks[0]?.duration.value,
      taskFloat: first.tasks[0]?.float.value,
      taskFreeFloat: first.tasks[0]?.freeFloat.value,
      scheduleDuration: first.networkSchedule?.[0]?.duration.value,
      scheduleFloat: first.networkSchedule?.[0]?.float.value,
      scheduleFreeFloat: first.networkSchedule?.[0]?.freeFloat.value,
    }

    first.projectDuration.value = 999
    first.primaryChain!.totalDuration!.value = 999
    first.alternateChains[0]!.totalDuration!.value = 999
    first.tasks[0]!.duration.value = 999
    first.tasks[0]!.float.value = 999
    first.tasks[0]!.freeFloat.value = 999
    first.networkSchedule![0]!.duration.value = 999
    first.networkSchedule![0]!.float.value = 999
    first.networkSchedule![0]!.freeFloat.value = 999

    const cached = await getProjectCriticalPathSnapshot('project-1')

    expect(cached.projectDuration.value).toBe(expected.project)
    expect(cached.primaryChain?.totalDuration?.value).toBe(expected.primary)
    expect(cached.alternateChains[0]?.totalDuration?.value).toBe(expected.alternate)
    expect(cached.tasks[0]?.duration.value).toBe(expected.taskDuration)
    expect(cached.tasks[0]?.float.value).toBe(expected.taskFloat)
    expect(cached.tasks[0]?.freeFloat.value).toBe(expected.taskFreeFloat)
    expect(cached.networkSchedule?.[0]?.duration.value).toBe(expected.scheduleDuration)
    expect(cached.networkSchedule?.[0]?.float.value).toBe(expected.scheduleFloat)
    expect(cached.networkSchedule?.[0]?.freeFloat.value).toBe(expected.scheduleFreeFloat)
  })

  it('exposes exact calendar identity on available primary, alternate, and network duration metrics', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    try {
      mocks.resolveConstructionCalendarContext.mockResolvedValue({
        basis: 'official_construction_calendar_seed',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
        windows: [],
      })
      mocks.tables.tasks = [
        {
          id: 'available-primary',
          project_id: 'project-1',
          title: 'Available primary',
          start_date: '2026-04-01',
          end_date: '2026-04-08',
          planned_end_date: '2026-04-08',
        },
        {
          id: 'available-alternate',
          project_id: 'project-1',
          title: 'Available alternate',
          start_date: '2026-04-01',
          end_date: '2026-04-08',
          planned_end_date: '2026-04-08',
        },
      ]
      mocks.tables.task_dependencies = []

      const snapshot = await getProjectCriticalPathSnapshot('project-1')
      const identity = {
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-04-10',
        availability: 'available',
        unavailableReason: null,
      }

      expect(snapshot.primaryChain?.totalDuration).toEqual(expect.objectContaining({ ...identity, value: 8 }))
      expect(snapshot.alternateChains[0]?.totalDuration).toEqual(expect.objectContaining({ ...identity, value: 8 }))
      for (const scheduledTask of snapshot.networkSchedule ?? []) {
        expect(scheduledTask.duration).toEqual(expect.objectContaining(identity))
        expect(scheduledTask.float).toEqual(expect.objectContaining(identity))
        expect(scheduledTask.freeFloat).toEqual(expect.objectContaining(identity))
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps CPM lineage hashes stable when typed duration DTOs are decorated', async () => {
    const withoutCalendarIdentity = await buildProjectCriticalPathSnapshot(
      'project-1',
      mocks.tables.tasks as Parameters<typeof buildProjectCriticalPathSnapshot>[1],
      mocks.tables.task_critical_overrides as Parameters<typeof buildProjectCriticalPathSnapshot>[2],
    )

    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
      windows: [],
    })
    const withCalendarIdentity = await buildProjectCriticalPathSnapshot(
      'project-1',
      mocks.tables.tasks as Parameters<typeof buildProjectCriticalPathSnapshot>[1],
      mocks.tables.task_critical_overrides as Parameters<typeof buildProjectCriticalPathSnapshot>[2],
    )

    expect(withoutCalendarIdentity.projectDuration.availability).toBe('unavailable')
    expect(withCalendarIdentity.projectDuration.availability).toBe('available')
    expect(withCalendarIdentity.networkLineage?.criticalSetHash)
      .toBe(withoutCalendarIdentity.networkLineage?.criticalSetHash)
    expect(withCalendarIdentity.networkLineage?.criticalPathInputHash)
      .toBe(withoutCalendarIdentity.networkLineage?.criticalPathInputHash)
  })

  it('marks disconnected cold-start CPM networks as low maturity instead of presenting longest-task fallback as authoritative', async () => {
    mocks.tables.tasks = [
      {
        id: 'cold-a',
        project_id: 'project-cold-disconnected',
        title: 'Foundation excavation',
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'cold-b',
        project_id: 'project-cold-disconnected',
        title: 'Structure preparation',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'cold-c',
        project_id: 'project-cold-disconnected',
        title: 'MEP rough-in preparation',
        start_date: '2026-04-01',
        end_date: '2026-04-06',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-06',
        duration_contribution_mode: 'duration_bearing',
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-cold-disconnected')

    expect(snapshot.projectDurationDays).toBe(10)
    expect((snapshot as any).networkMaturity).toEqual(expect.objectContaining({
      level: 'low',
      policy: 'disconnected_cold_start_longest_task_is_not_authoritative_cpm',
      dependencyEdgeCount: 0,
    }))
    expect((snapshot as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'cpm.network.disconnected_cold_start' }),
    ]))
  })

  it('surfaces T2 phase-1 rhythm network evidence in E3 CPM snapshots without using it as authoritative task dependencies', async () => {
    useAuthoritativeConstructionCalendar()
    mocks.tables.tasks = [
      {
        id: 'cold-a',
        project_id: 'project-cold-t2',
        title: 'Standard floor structure',
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'cold-b',
        project_id: 'project-cold-t2',
        title: 'Standard floor MEP rough-in',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'duration_bearing',
      },
    ]
    mocks.tables.task_dependencies = []
    mocks.readLiveProjectGenerationFacts.mockResolvedValue({
      t2RhythmScheduleCandidateNetworkEvaluation: {
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        candidateId: 't2-phase1-project-cold-t2',
        tier: 'T2',
        status: 'phase1_readonly_evaluation_ready',
        canEnterC1913Phase1Selection: true,
        networkSpanDays: 42,
        criticalWindowCodes: ['structure_cycle', 'mep_rough_in_cycle'],
        criticalNodeIds: ['node-structure', 'node-mep'],
        nodeEvaluations: [
          { nodeId: 'node-structure', windowCode: 'structure_cycle', isCritical: true },
          { nodeId: 'node-mep', windowCode: 'mep_rough_in_cycle', isCritical: true },
        ],
        conflictSummary: {
          conflictCount: 0,
          conflictCodes: [],
          priorityOverrideBlocked: false,
        },
        scheduleTrustEvidence: {
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          dependencyEdgeCount: 5,
          hardGateCount: 3,
          topologyEvaluated: true,
          floatCalculated: true,
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        phase1PublicationGate: {
          status: 'blocked_pending_release_evidence',
          canPublishRuntimeExperience: false,
          canMaterializeTaskDependencies: false,
          releaseBlockers: [
            'archived_live_replay_required',
            'l5_canary_publish_rollback_required',
          ],
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
          writesSeed: false,
          writesBaseline: false,
        },
      },
    })

    const result = await recalculateProjectCriticalPath('project-cold-t2')
    const snapshot = result.snapshot

    expect((snapshot as any).t2RhythmScheduleCandidateNetworkEvidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      candidateId: 't2-phase1-project-cold-t2',
      status: 'phase1_readonly_evaluation_ready',
      canEnterC1913Phase1Selection: true,
      networkSpanDays: 42,
      criticalWindowCodes: ['structure_cycle', 'mep_rough_in_cycle'],
      dependencyEdgeCount: 5,
      hardGateCount: 3,
      topologyEvaluated: true,
      floatCalculated: true,
      canMaterializeTaskDependencies: false,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect((snapshot as any).networkMaturity).toEqual(expect.objectContaining({
      level: 'low',
      policy: 'disconnected_cold_start_longest_task_is_not_authoritative_cpm',
      dependencyEdgeCount: 0,
    }))
    expect(snapshot.edges.filter((edge) => edge.source === 'dependency')).toHaveLength(0)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'critical_path_cpm',
      predictionContext: expect.objectContaining({
        t2RhythmScheduleCandidateNetworkEvidence: expect.objectContaining({
          candidateId: 't2-phase1-project-cold-t2',
          status: 'phase1_readonly_evaluation_ready',
          canMaterializeTaskDependencies: false,
          mutationBoundary: expect.objectContaining({
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          }),
        }),
      }),
    }))
  })

  it('caps implausible CPM durations and keeps the clamp visible in snapshot warnings', async () => {
    mocks.tables.tasks = [
      {
        id: 'typo-duration',
        project_id: 'project-duration-typo',
        title: 'Typo task with 9999-day duration',
        start_date: '2026-04-01',
        end_date: '2053-08-16',
        planned_start_date: '2026-04-01',
        planned_end_date: '2053-08-16',
        duration_contribution_mode: 'duration_bearing',
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-duration-typo')

    expect(snapshot.projectDurationDays).toBeLessThanOrEqual(730)
    expect(snapshot.tasks[0]?.durationDays).toBeLessThanOrEqual(730)
    expect((snapshot as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'duration.max.critical_path_task' }),
    ]))
  })

  it('surfaces overconstrained dependency networks when raw CPM float is negative', async () => {
    mocks.tables.tasks = [
      {
        id: 'predecessor',
        project_id: 'project-negative-float',
        title: 'Predecessor',
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'successor',
        project_id: 'project-negative-float',
        title: 'Successor',
        start_date: '2026-04-05',
        end_date: '2026-04-08',
        planned_start_date: '2026-04-05',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'duration_bearing',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-overconstrained',
        project_id: 'project-negative-float',
        task_id: 'successor',
        dependency_task_id: 'predecessor',
        dependency_type: 'FS',
        lag_days: -20,
        required_for_start: true,
        status: 'active',
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-negative-float')

    expect((snapshot as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'cpm.float.negative',
        taskId: 'predecessor',
      }),
    ]))
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

    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-a-task-b',
        project_id: 'project-cache-failure',
        task_id: 'task-a',
        dependency_task_id: 'task-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-task-b-task-a',
        project_id: 'project-cache-failure',
        task_id: 'task-b',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const failedSnapshot = (await recalculateProjectCriticalPath('project-cache-failure')).snapshot

    expect(failedSnapshot.calculationStatus).toBe('cached_after_failure')
    expect(failedSnapshot.displayTaskIds).toEqual(successSnapshot.displayTaskIds)
    expect(failedSnapshot.calculatedAt).toBe(successSnapshot.calculatedAt)
    expect(failedSnapshot.lastSuccessfulCalculatedAt).toBe(successSnapshot.calculatedAt)
    expect(failedSnapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('does not return cached critical-path tasks that no longer exist after a failed recalculation', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-cache-pruned',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
      },
      {
        id: 'task-b',
        project_id: 'project-cache-pruned',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
    ]

    const successSnapshot = await getProjectCriticalPathSnapshot('project-cache-pruned')
    expect(successSnapshot.displayTaskIds).toEqual(['task-b'])

    mocks.tables.tasks = [
      {
        id: 'cycle-a',
        project_id: 'project-cache-pruned',
        title: 'Cycle A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
      },
      {
        id: 'cycle-b',
        project_id: 'project-cache-pruned',
        title: 'Cycle B',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-cycle-a-cycle-b',
        project_id: 'project-cache-pruned',
        task_id: 'cycle-a',
        dependency_task_id: 'cycle-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-cycle-b-cycle-a',
        project_id: 'project-cache-pruned',
        task_id: 'cycle-b',
        dependency_task_id: 'cycle-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const failedSnapshot = (await recalculateProjectCriticalPath('project-cache-pruned')).snapshot

    expect(failedSnapshot.calculationStatus).toBe('empty_after_failure')
    expect(failedSnapshot.displayTaskIds).not.toContain('task-b')
    expect(failedSnapshot.tasks.map((task) => task.taskId)).not.toContain('task-b')
    expect(failedSnapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('expires failed-recalculation critical path cache after the short TTL window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T08:00:00.000Z'))
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-cache-ttl',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
      },
      {
        id: 'task-b',
        project_id: 'project-cache-ttl',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
    ]

    const successSnapshot = await getProjectCriticalPathSnapshot('project-cache-ttl')
    expect(successSnapshot.calculationStatus).toBe('fresh')

    vi.setSystemTime(new Date('2026-06-19T08:06:00.000Z'))
    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-a-task-b',
        project_id: 'project-cache-ttl',
        task_id: 'task-a',
        dependency_task_id: 'task-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-task-b-task-a',
        project_id: 'project-cache-ttl',
        task_id: 'task-b',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const failedSnapshot = await getProjectCriticalPathSnapshot('project-cache-ttl')

    expect(failedSnapshot.calculationStatus).toBe('empty_after_failure')
    expect(failedSnapshot.displayTaskIds).toEqual([])
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
        id: 'dep-c-a-unconfirmed-heuristic',
        project_id: 'project-typed',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
        source_type: 'template_generated',
        metadata: {
          source: 'heuristic_stagger',
          sequencingBasis: 'heuristic_stagger',
          intentCode: 'sequencing_fallback:heuristic_stagger',
          dependencyRuleEvidence: {
            evidenceLevel: 'heuristic_fallback_l0',
          },
        },
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

  it('keeps the global same-resource fallback from serializing tasks whose planned windows do not overlap', async () => {
    mocks.tables.tasks = [
      {
        id: 'pour-a',
        project_id: 'project-resource-non-overlap',
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
        project_id: 'project-resource-non-overlap',
        title: 'Concrete pour zone B',
        standard_work_code: 'cast_in_place_concrete',
        start_date: '2026-04-10',
        end_date: '2026-04-14',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-14',
        metadata: {
          resourceProfile: {
            resourceClass: 'concrete_pour',
            parallelCapacity: 'low',
          },
        },
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-resource-non-overlap')

    expect(snapshot.edges.filter((edge) => edge.source === 'resource_constraint')).toHaveLength(0)
    expect(snapshot.projectDurationDays).toBe(5)
  })

  it('persists task float projections from the same snapshot exposed by the API', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
      windows: [],
    })
    mocks.tables.tasks = [
      {
        id: 'task-before-wait',
        project_id: 'project-snapshot-float',
        title: 'Task before external wait',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-03',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'external-wait',
        project_id: 'project-snapshot-float',
        title: 'External approval wait',
        start_date: '2026-04-04',
        end_date: '2026-04-08',
        planned_start_date: '2026-04-04',
        planned_end_date: '2026-04-08',
        duration_contribution_mode: 'external_wait',
      },
      {
        id: 'task-after-wait',
        project_id: 'project-snapshot-float',
        title: 'Task after external wait',
        start_date: '2026-04-09',
        end_date: '2026-04-10',
        planned_start_date: '2026-04-09',
        planned_end_date: '2026-04-10',
        duration_contribution_mode: 'duration_bearing',
      },
      {
        id: 'parallel-slack',
        project_id: 'project-snapshot-float',
        title: 'Parallel non-critical slack task',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-02',
        duration_contribution_mode: 'duration_bearing',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-wait-after-before',
        project_id: 'project-snapshot-float',
        task_id: 'external-wait',
        dependency_task_id: 'task-before-wait',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-after-wait',
        project_id: 'project-snapshot-float',
        task_id: 'task-after-wait',
        dependency_task_id: 'external-wait',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const result = await recalculateProjectCriticalPath('project-snapshot-float')
    const snapshotFloatByTask = new Map(
      (result.snapshot.networkSchedule ?? []).map((item) => [item.taskId, item.floatDays]),
    )

    for (const row of mocks.tables.tasks) {
      if (row.duration_contribution_mode === 'external_wait') {
        expect(row).not.toHaveProperty('total_float_days')
        continue
      }
      expect(row.total_float_days).toBe(snapshotFloatByTask.get(row.id))
    }
    expect(result.snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringContaining('semantic-external-wait'),
        fromTaskId: 'task-before-wait',
        toTaskId: 'task-after-wait',
        lagDays: 5,
      }),
    ]))
  })

  it('uses spatial daily limits as RCPSP resource constraints even when broad parallel capacity is high', async () => {
    const resourceProfile = {
      resourceClass: 'electrical',
      parallelCapacity: 'high',
      sameBuildingDailyLimit: 3,
      sameUnitDailyLimit: 3,
      sameFloorDailyLimit: 1,
      sameZoneDailyLimit: 3,
      sameSystemDailyLimit: 3,
    }
    mocks.tables.tasks = [
      {
        id: 'electrical-a',
        project_id: 'project-spatial-resource',
        title: 'Electrical rough-in A',
        standard_work_code: 'electrical_rough_in',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-03',
        floor_object_id: 'floor-12',
        building_object_id: 'building-1',
        metadata: { resourceProfile },
      },
      {
        id: 'electrical-b',
        project_id: 'project-spatial-resource',
        title: 'Electrical rough-in B',
        standard_work_code: 'electrical_rough_in',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-03',
        floor_object_id: 'floor-12',
        building_object_id: 'building-1',
        metadata: { resourceProfile },
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-spatial-resource')

    expect(snapshot.projectDurationDays).toBe(6)
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromTaskId: 'electrical-a',
        toTaskId: 'electrical-b',
        source: 'resource_constraint',
        dependencyType: 'FS',
        lagDays: 0,
      }),
    ]))
  })

  it('uses towerCraneCount project facts as the tower crane resource capacity ceiling', async () => {
    mocks.readLiveProjectGenerationFacts.mockResolvedValue({ towerCraneCount: 2 })
    mocks.tables.tasks = [
      {
        id: 'crane-a',
        project_id: 'project-tower-crane',
        title: 'Tower crane lift A',
        standard_work_code: 'tower_crane_lift',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        metadata: { resourceProfile: { resourceClass: 'tower_crane' } },
      },
      {
        id: 'crane-b',
        project_id: 'project-tower-crane',
        title: 'Tower crane lift B',
        standard_work_code: 'tower_crane_lift',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        metadata: { resourceProfile: { resourceClass: 'tower_crane' } },
      },
      {
        id: 'crane-c',
        project_id: 'project-tower-crane',
        title: 'Tower crane lift C',
        standard_work_code: 'tower_crane_lift',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        metadata: { resourceProfile: { resourceClass: 'tower_crane' } },
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-tower-crane')

    expect(snapshot.projectDurationDays).toBe(10)
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromTaskId: 'crane-a',
        toTaskId: 'crane-c',
        source: 'resource_constraint',
        dependencyType: 'FS',
        lagDays: 0,
      }),
    ]))
  })

  it('does not rebuild the dependency graph for every generated resource edge', () => {
    const source = readFileSync(resolve(__dirname, '..', 'services', 'projectCriticalPathService.ts'), 'utf8')
    const appendResourceConstraintEdgesSource = source.slice(
      source.indexOf('function appendResourceConstraintEdges'),
      source.indexOf('function addSpatialResourceBucket'),
    )

    expect(appendResourceConstraintEdgesSource).toContain('cycleGuard')
    expect(appendResourceConstraintEdgesSource).not.toContain('wouldCreateDependencyCycle(edges')
  })

  it('calculates a deep linear CPM network without recursive stack overflow', async () => {
    const count = 6000
    mocks.tables.tasks = Array.from({ length: count }, (_, index) => ({
      id: `linear-${index}`,
      project_id: 'project-deep-linear',
      title: `Linear task ${index}`,
      start_date: '2026-04-01',
      end_date: '2026-04-01',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-01',
    }))
    mocks.tables.task_dependencies = Array.from({ length: count - 1 }, (_, index) => ({
      id: `dep-linear-${index}-${index + 1}`,
      project_id: 'project-deep-linear',
      task_id: `linear-${index + 1}`,
      dependency_task_id: `linear-${index}`,
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
    }))

    const snapshot = await getProjectCriticalPathSnapshot('project-deep-linear')

    expect(snapshot.calculationStatus).toBe('fresh')
    expect(snapshot.hasCycleDetected).toBe(false)
    expect(snapshot.displayTaskIds).toHaveLength(count)
    expect(snapshot.projectDurationDays).toBe(count)
  })

  it('bounds auto critical chain extraction for wide diamond networks', async () => {
    const layerCount = 12
    const tasks: Row[] = [{
      id: 'diamond-start',
      project_id: 'project-diamond',
      title: 'Diamond start',
      start_date: '2026-04-01',
      end_date: '2026-04-01',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-01',
    }]
    const dependencies: Row[] = []
    let previousLayer = ['diamond-start']

    for (let layer = 0; layer < layerCount; layer += 1) {
      const currentLayer = [`diamond-${layer}-a`, `diamond-${layer}-b`]
      for (const taskId of currentLayer) {
        tasks.push({
          id: taskId,
          project_id: 'project-diamond',
          title: `Diamond ${layer} ${taskId.endsWith('-a') ? 'A' : 'B'}`,
          start_date: '2026-04-01',
          end_date: '2026-04-01',
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-01',
        })
        for (const predecessor of previousLayer) {
          dependencies.push({
            id: `dep-${predecessor}-${taskId}`,
            project_id: 'project-diamond',
            task_id: taskId,
            dependency_task_id: predecessor,
            dependency_type: 'FS',
            lag_days: 0,
            required_for_start: true,
            status: 'active',
          })
        }
      }
      previousLayer = currentLayer
    }

    mocks.tables.tasks = tasks
    mocks.tables.task_dependencies = dependencies

    const snapshot = await getProjectCriticalPathSnapshot('project-diamond')

    expect(snapshot.calculationStatus).toBe('fresh')
    expect(snapshot.alternateChains.length).toBeLessThanOrEqual(7)
    expect(snapshot.displayTaskIds.length).toBeLessThanOrEqual(tasks.length)
    expect(new Set(snapshot.displayTaskIds).size).toBe(snapshot.displayTaskIds.length)
  })
})
