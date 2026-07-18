import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  snapshots: [] as Array<Record<string, unknown>>,
  obstacles: [] as Array<Record<string, unknown>>,
  dependencies: [] as Array<Record<string, unknown>>,
  dependencyForecasts: [] as Array<Record<string, unknown>>,
  conditions: [] as Array<Record<string, unknown>>,
  materials: [] as Array<Record<string, unknown>>,
  acceptancePlans: [] as Array<Record<string, unknown>>,
  projectEntityLinks: [] as Array<Record<string, unknown>>,
  drawingPackages: [] as Array<Record<string, unknown>>,
  constructionDrawings: [] as Array<Record<string, unknown>>,
  certificateWorkItems: [] as Array<Record<string, unknown>>,
  preMilestones: [] as Array<Record<string, unknown>>,
  projects: [] as Array<Record<string, unknown>>,
  modelProfiles: [] as Array<Record<string, unknown>>,
  projectOverlays: [] as Array<Record<string, unknown>>,
  residualOverlays: [] as Array<Record<string, unknown>>,
  seedRecords: [] as Array<Record<string, unknown>>,
  insertedForecasts: [] as Array<Record<string, unknown>>,
  updatedForecasts: [] as Array<Record<string, unknown>>,
}))

const mocks = vi.hoisted(() => ({
  getTaskDurationSuggestion: vi.fn(),
  loadPublishedProgressVelocityRuntime: vi.fn(),
  recordDurationAccuracyPrediction: vi.fn(),
  loadAlgorithmAssetLearnableParameterRuntimeValue: vi.fn(),
  readPlanningReplayCalibrationReadback: vi.fn(),
  from: vi.fn(),
  rawQuery: vi.fn(async () => ({ rows: [] })),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

function createBuilder(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  const inFilters: Array<{ column: string; values: unknown[] }> = []
  const ltFilters: Array<{ column: string; value: number }> = []
  let limitCount: number | null = null
  let pendingUpdate: Record<string, unknown> | null = null

  const rows = () => {
    let data: Array<Record<string, unknown>> = []
    if (table === 'tasks') data = state.tasks
    if (table === 'task_progress_snapshots') data = state.snapshots
    if (table === 'task_obstacles') data = state.obstacles
    if (table === 'task_dependencies') data = state.dependencies
    if (table === 'task_duration_forecasts') data = state.dependencyForecasts
    if (table === 'task_conditions') data = state.conditions
    if (table === 'project_materials') data = state.materials
    if (table === 'acceptance_plans') data = state.acceptancePlans
    if (table === 'project_entity_links') data = state.projectEntityLinks
    if (table === 'drawing_packages') data = state.drawingPackages
    if (table === 'construction_drawings') data = state.constructionDrawings
    if (table === 'certificate_work_items') data = state.certificateWorkItems
    if (table === 'pre_milestones') data = state.preMilestones
    if (table === 'projects') data = state.projects
    if (table === 'duration_forecast_model_profiles') data = state.modelProfiles
    if (table === 'duration_forecast_project_overlays') data = state.projectOverlays
    if (table === 'duration_forecast_residual_overlays') data = state.residualOverlays

    let result = data.filter((row) => (
      filters.every((filter) => filter.value === null
        ? row[filter.column] == null
        : row[filter.column] === filter.value)
      && inFilters.every((filter) => filter.values.includes(row[filter.column]))
      && ltFilters.every((filter) => {
        const value = Number(row[filter.column])
        return Number.isFinite(value) && value < filter.value
      })
    ))

    if (table === 'task_progress_snapshots') {
      result = result.sort((left, right) => String(left.snapshot_date).localeCompare(String(right.snapshot_date)))
    }
    return limitCount == null ? result : result.slice(0, limitCount)
  }

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      inFilters.push({ column, values })
      return builder
    }),
    lt: vi.fn((column: string, value: number) => {
      ltFilters.push({ column, value })
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn((value: number) => {
      limitCount = value
      return builder
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      pendingUpdate = payload
      return builder
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      state.insertedForecasts.push(payload)
      if (table === 'task_duration_forecasts') {
        state.dependencyForecasts.push({
          id: `inserted-forecast-${state.dependencyForecasts.length + 1}`,
          ...payload,
        })
      }
      return { error: null }
    }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const resultRows = rows()
      if (pendingUpdate) {
        state.updatedForecasts.push({ table, filters: [...filters], payload: pendingUpdate })
        for (const row of resultRows) Object.assign(row, pendingUpdate)
      }
      return Promise.resolve({ data: resultRows, error: null }).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/durationSuggestionService.js', () => ({
  getTaskDurationSuggestion: mocks.getTaskDurationSuggestion,
}))

vi.mock('../services/progressVelocityRuntimePublicationService.js', () => ({
  loadPublishedProgressVelocityRuntime: mocks.loadPublishedProgressVelocityRuntime,
}))

vi.mock('../services/algorithmAssetLearnableParameterRuntimeConsumptionService.js', () => ({
  loadAlgorithmAssetLearnableParameterRuntimeValue: mocks.loadAlgorithmAssetLearnableParameterRuntimeValue,
}))

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  recordDurationAccuracyPrediction: mocks.recordDurationAccuracyPrediction,
}))

vi.mock('../services/planningReplayCalibrationService.js', () => ({
  readPlanningReplayCalibrationReadback: mocks.readPlanningReplayCalibrationReadback,
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  resolveAlgorithmSeedRecords: vi.fn(async (seedType: string) => {
    if (seedType === 'work_calendar') return state.seedRecords
    if (seedType === 'earliest_start_rule') {
      return [{ __stableCode: 'unstarted_overdue_default', scenario: 'unstarted_overdue' }]
    }
    return []
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const {
  forecastTaskDuration: forecastTaskDurationWithScope,
  listCurrentTaskDurationForecasts,
  analyzeTaskDelayRiskWithDurationForecast: analyzeTaskDelayRiskWithDurationForecastWithScope,
  refreshDailyActiveTaskDurationForecasts,
  recordTaskDurationForecastRuntimeConsumption,
} = await import('../services/taskDurationForecastService.js')

function projectIdForTask(taskId: string) {
  return String(state.tasks.find((task) => task.id === taskId)?.project_id ?? 'project-1')
}

function forecastTaskDuration(
  taskId: string,
  options: NonNullable<Parameters<typeof forecastTaskDurationWithScope>[1]> = {},
) {
  return forecastTaskDurationWithScope(taskId, {
    projectId: projectIdForTask(taskId),
    ...options,
  })
}

function analyzeTaskDelayRiskWithDurationForecast(taskId: string) {
  return analyzeTaskDelayRiskWithDurationForecastWithScope(taskId, {
    projectId: projectIdForTask(taskId),
  })
}

const serviceSourcePath = fileURLToPath(new URL('../services/taskDurationForecastService.ts', import.meta.url))

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

function baseSuggestion() {
  return {
    recommendedDurationDays: 10,
    conservativeDurationDays: 16,
    confidenceLevel: 'medium',
    confidenceScore: 62,
    forecastSource: 'standard_work_duration_seed',
    durationCalibrationSource: 'standard_work_duration_seed',
    durationProvenance: 'standard_work_duration_seed',
    benchmarkKey: 'standard:process',
    businessReason: 'Reference duration from standard work seed.',
    factorSummary: { businessReasons: ['Standard duration benchmark is available.'] },
    calculationContext: { duration_source: 'standard' },
  }
}

describe('taskDurationForecastService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-18T08:00:00.000Z'))
    vi.clearAllMocks()
    state.tasks = []
    state.snapshots = []
    state.obstacles = []
    state.dependencies = []
    state.dependencyForecasts = []
    state.conditions = []
    state.materials = []
    state.acceptancePlans = []
    state.projectEntityLinks = []
    state.drawingPackages = []
    state.constructionDrawings = []
    state.certificateWorkItems = []
    state.preMilestones = []
    state.projects = []
    state.modelProfiles = []
    state.projectOverlays = []
    state.residualOverlays = []
    state.seedRecords = []
    state.insertedForecasts = []
    state.updatedForecasts = []
    mocks.from.mockImplementation((table: string) => createBuilder(table))
    mocks.getTaskDurationSuggestion.mockResolvedValue(baseSuggestion())
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValue(null)
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockResolvedValue({
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: '',
      runtimeValue: null,
      consumptionMode: 'stable',
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      companyId: null,
      projectId: null,
      rollbackTarget: null,
      reasons: ['runtime_parameter_publication_not_found'],
      writesSeedRuntimeDirectly: false,
    })
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue(null)
  })

  it('rejects a task that is outside the explicit project scope', async () => {
    state.tasks = [{
      id: 'task-cross-project',
      project_id: 'project-2',
      title: 'Cross-project task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
      status: 'todo',
    }]

    await expect(forecastTaskDurationWithScope('task-cross-project', {
      projectId: 'project-1',
    })).rejects.toThrow('TASK_DURATION_FORECAST_PROJECT_SCOPE_MISMATCH')
    expect(state.insertedForecasts).toEqual([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps runtime consumer evidence production persistence on a fixed SQL executor', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('buildTaskDurationForecastRuntimeConsumerObservationQueryExec')
    expect(source).toContain('createDurationRuntimeConsumerObservationQueryExec')
  })

  it('records a v1.4.22.4 prediction event for task remaining duration forecasts', async () => {
    state.tasks = [{
      id: 'task-remaining-event',
      project_id: 'project-1',
      title: 'Concrete pour zone B',
      template_node_id: 'template-node-2',
      wbs_node_type: 'process',
      engineering_category_id: 'civil',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-24',
      actual_start_date: '2026-05-10',
      progress: 50,
      is_critical: true,
    }]

    const forecast = await forecastTaskDuration('task-remaining-event')

    expect(forecast.remainingDurationDays).not.toBeNull()
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'task_remaining_forecast',
      outputKind: 'remaining_duration_forecast',
      projectId: 'project-1',
      taskId: 'task-remaining-event',
      predictedDurationDays: forecast.remainingDurationDays,
      predictedFinishDate: forecast.forecastFinishDate,
      runtimeConsumptionState: 'runtime_snapshot',
      modelVersion: 'remaining_duration_forecast_v1',
      seedLineage: expect.objectContaining({
        standardWorkCode: 'cast_in_place_concrete',
        durationCalibrationSource: 'standard_work_duration_seed',
      }),
      networkLineage: expect.objectContaining({
        wbsTemplateVersion: 'template-node:template-node-2',
        wbsNodeType: 'process',
        criticalPathMembership: true,
      }),
      predictionContext: expect.objectContaining({
        sourceService: 'taskDurationForecastService',
        triggerContext: 'api_request',
      }),
    }))
  })

  it('records the forecast runtime call without fabricating observations when no publication is consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    state.tasks = [{
      id: 'task-call-only',
      project_id: 'project-1',
      title: 'Call-only forecast task',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-24',
      actual_start_date: '2026-05-10',
      progress: 50,
    }]

    await forecastTaskDuration('task-call-only', {
      runtimeConsumerObservationQueryExec: queryExec,
    })

    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
    const runtimeCall = callsForTable(calls, 'runtime_consumer_runtime_calls')[0]
    expect(runtimeCall?.sql).toContain('$4::jsonb')
    expect(JSON.parse(String(runtimeCall?.params[3]))).toEqual(expect.objectContaining({
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
  })

  it('uses a stable daily dedupe key for task remaining forecast accuracy snapshots', async () => {
    vi.setSystemTime(new Date('2026-06-15T08:00:00.123Z'))
    state.tasks = [{
      id: 'task-remaining-dedupe',
      project_id: 'project-1',
      title: 'Dedupe-stable forecast task',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-20',
      actual_start_date: '2026-06-01',
      progress: 40,
    }]

    await forecastTaskDuration('task-remaining-dedupe')
    vi.setSystemTime(new Date('2026-06-15T08:00:00.987Z'))
    await forecastTaskDuration('task-remaining-dedupe')

    const dedupeKeys = mocks.recordDurationAccuracyPrediction.mock.calls
      .map(([event]) => event.dedupeKey)

    expect(dedupeKeys).toEqual([
      'project-1:task-remaining-dedupe:remaining_duration_forecast:api_request:2026-06-15',
      'project-1:task-remaining-dedupe:remaining_duration_forecast:api_request:2026-06-15',
    ])
  })

  it('records v1.4.22.5 runtime consumer evidence for task duration forecast artifacts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordTaskDurationForecastRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      taskId: 'task-1',
      forecast: {
        taskId: 'task-1',
        recommendedDurationDays: 10,
        conservativeDurationDays: 14,
        remainingDurationDays: 6,
        conservativeRemainingDays: 9,
        forecastFinishDate: '2026-06-22',
        forecastDelayDays: 2,
        confidenceLevel: 'medium',
        confidenceScore: 68,
        forecastSource: 'task_remaining_forecast',
        businessReason: 'Runtime forecast from residual overlay.',
      },
      observedAt: '2026-06-15T11:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v8',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:forecast-residual-overlay:overlay-v8'],
        },
        {
          assetKey: 'forecast_confidence_weight',
          publicationKey: 'forecast_confidence_weight_runtime:weight-v8',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:forecast-confidence-weight:weight-v8'],
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'wbs_reference_days_runtime:reference-v8',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:wbs-reference-days:reference-v8'],
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
        'forecast_residual_overlay',
        'forecast_residual_overlay_runtime:overlay-v8',
        'taskDurationForecastService',
        'task_duration_forecast',
      ],
      [
        'forecast_confidence_weight',
        'forecast_confidence_weight_runtime:weight-v8',
        'taskDurationForecastService',
        'task_duration_forecast',
      ],
    ])
  })

  it('blocks task duration forecast artifact observations when artifact lineage evidence is missing', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordTaskDurationForecastRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      taskId: 'task-no-artifact-lineage',
      forecast: {
        taskId: 'task-no-artifact-lineage',
        recommendedDurationDays: 10,
        conservativeDurationDays: 14,
        remainingDurationDays: 6,
        conservativeRemainingDays: 9,
        forecastFinishDate: '2026-06-22',
        forecastDelayDays: 2,
        confidenceLevel: 'medium',
        confidenceScore: 68,
        forecastSource: 'task_remaining_forecast',
        businessReason: 'Runtime forecast from residual overlay.',
      },
      observedAt: '2026-06-15T11:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-no-lineage',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_blocked',
      recordedCount: 0,
      blockedCount: 1,
      reasons: ['runtime_consumer_observation_source_evidence_required'],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toEqual([])
  })

  it('records runtime consumer evidence from forecastTaskDuration when confidence weight artifacts are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockImplementation(async (input: any) => {
      if (input.parameterKey === 'forecast.confidence_weight_multiplier') {
        return {
          status: 'runtime_parameter_consumable',
          runtimeConsumable: true,
          parameterKey: input.parameterKey,
          runtimeValue: 0.5,
          consumptionMode: input.consumptionMode ?? 'stable',
          publicationKey: 'forecast_confidence_weight_runtime:weight-v8',
          publicationStatus: 'published',
          scopeLevel: 'company',
          companyId: 'company-runtime',
          projectId: null,
          rollbackTarget: 'forecast_confidence_weight_runtime:weight-v7',
          reasons: [],
          writesSeedRuntimeDirectly: false,
        }
      }
      return {
        status: 'runtime_parameter_not_found',
        runtimeConsumable: false,
        parameterKey: input.parameterKey,
        runtimeValue: null,
        consumptionMode: input.consumptionMode ?? 'stable',
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: input.companyId ?? null,
        projectId: input.projectId ?? null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_publication_not_found'],
        writesSeedRuntimeDirectly: false,
      }
    })
    state.projects = [{
      id: 'project-runtime',
      company_id: 'company-runtime',
    }]
    state.modelProfiles = [{
      id: 'profile-runtime-confidence',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'runtime_confidence_weight_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-runtime-confidence-observation',
      project_id: 'project-runtime',
      title: 'Runtime confidence observation task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-27',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-runtime-confidence-observation', {
      runtimeConsumerObservationQueryExec: queryExec,
    } as any)

    expect(forecast.forecastSources?.learnableParameterRuntimeGate).toEqual(expect.objectContaining({
      appliedRuntimeParameterCount: 1,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'forecast_confidence_weight',
        'forecast_confidence_weight_runtime:weight-v8',
        'taskDurationForecastService',
        'task_duration_forecast',
      ],
    ])
  })

  it('applies only published residual overlays to task remaining forecasts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 26,
    })
    state.modelProfiles = [{
      id: 'profile-residual-overlay-runtime',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'residual_overlay_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-residual-overlay',
      project_id: 'project-overlay',
      title: 'Generic linear task',
      standard_work_code: 'generic_linear_task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-06-06',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]
    state.residualOverlays = [{
      overlay_key: 'shadow-overlay-ignored',
      asset_key: 'task_remaining_forecast',
      scope_level: 'project',
      company_id: 'company-1',
      project_id: 'project-overlay',
      learning_target: 'forecast_residual',
      learning_maturity: 'shadow_report_only',
      publish_anchor: 'candidate_only',
      automation_maturity: 'auto_shadow',
      original_mae: 8,
      overlay_mae: 5,
      mae_improvement_ratio: 0.3,
      overcompensation_ratio: 0.1,
      residual_payload: { residualCorrectionDays: 9 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      rollback_target: { action: 'disable_overlay', overlayKey: 'shadow-overlay-ignored' },
    }, {
      overlay_key: 'rolled-back-overlay-ignored',
      asset_key: 'task_remaining_forecast',
      scope_level: 'project',
      company_id: 'company-1',
      project_id: 'project-overlay',
      learning_target: 'forecast_residual',
      learning_maturity: 'guarded_live_tuning',
      publish_anchor: 'guarded_runtime_auto_publish',
      automation_maturity: 'auto_publish',
      runtime_publication_status: 'runtime_rolled_back',
      original_mae: 8,
      overlay_mae: 1,
      mae_improvement_ratio: 0.875,
      overcompensation_ratio: 0.05,
      residual_payload: { residualCorrectionDays: 8 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      rollback_target: { action: 'disable_overlay', overlayKey: 'rolled-back-overlay-ignored' },
    }, {
      overlay_key: 'published-overlay-plus-three-days',
      asset_key: 'task_remaining_forecast',
      scope_level: 'project',
      company_id: 'company-1',
      project_id: 'project-overlay',
      learning_target: 'forecast_residual',
      learning_maturity: 'guarded_live_tuning',
      publish_anchor: 'guarded_runtime_auto_publish',
      automation_maturity: 'auto_canary',
      runtime_publication_status: 'canary',
      original_mae: 8,
      overlay_mae: 4,
      mae_improvement_ratio: 0.5,
      overcompensation_ratio: 0.12,
      residual_payload: { residualCorrectionDays: 3, sampleCount: 8 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      publication_key: 'forecast_residual_overlay_runtime:overlay-plus-three-days-v2',
      rollback_target: { action: 'disable_overlay', overlayKey: 'published-overlay-plus-three-days' },
    }]

    const forecast = await forecastTaskDuration('task-residual-overlay', {
      runtimeConsumerObservationQueryExec: queryExec,
    })

    expect(forecast.remainingDurationDays).toBe(13)
    expect(forecast.forecastFinishDate).toBe('2026-05-30')
    expect(forecast.forecastSources?.residualOverlay).toEqual(expect.objectContaining({
      runtimeApplied: true,
      overlayKey: 'published-overlay-plus-three-days',
      publicationKey: 'forecast_residual_overlay_runtime:overlay-plus-three-days-v2',
      ignoredOverlayKeys: ['shadow-overlay-ignored', 'rolled-back-overlay-ignored'],
      beforeRemainingDurationDays: 10,
      afterRemainingDurationDays: 13,
      residualCorrectionDays: 3,
      sampleCount: 8,
      minSampleCount: 5,
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      runtimePublicationStatus: 'canary',
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-residual-overlay',
      predictedDurationDays: 13,
      runtimeConsumptionState: 'residual_overlay_published',
      predictionContext: expect.objectContaining({
        forecastSources: expect.objectContaining({
          residualOverlay: expect.objectContaining({
            overlayKey: 'published-overlay-plus-three-days',
            runtimeApplied: true,
          }),
        }),
      }),
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([[
      'forecast_residual_overlay',
      'forecast_residual_overlay_runtime:overlay-plus-three-days-v2',
      'taskDurationForecastService',
      'task_duration_forecast',
    ]])
  })

  it('does not apply residual overlays before the minimum runtime sample gate is met', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 26,
    })
    state.modelProfiles = [{
      id: 'profile-residual-overlay-thin',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'residual_overlay_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-thin-residual-overlay',
      project_id: 'project-thin-overlay',
      title: 'Generic linear task',
      standard_work_code: 'generic_linear_task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-06-06',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]
    state.residualOverlays = [{
      overlay_key: 'thin-overlay-must-not-apply',
      asset_key: 'task_remaining_forecast',
      scope_level: 'project',
      company_id: 'company-1',
      project_id: 'project-thin-overlay',
      learning_target: 'forecast_residual',
      learning_maturity: 'guarded_live_tuning',
      publish_anchor: 'guarded_runtime_auto_publish',
      automation_maturity: 'auto_canary',
      runtime_publication_status: 'canary',
      original_mae: 8,
      overlay_mae: 4,
      mae_improvement_ratio: 0.5,
      overcompensation_ratio: 0.12,
      residual_payload: { residualCorrectionDays: 3, sampleCount: 1 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      publication_key: 'forecast_residual_overlay_runtime:thin-overlay-v1',
      rollback_target: { action: 'disable_overlay', overlayKey: 'thin-overlay-must-not-apply' },
    }]

    const forecast = await forecastTaskDuration('task-thin-residual-overlay')

    expect(forecast.remainingDurationDays).toBe(10)
    expect(forecast.forecastSources?.residualOverlay).toEqual(expect.objectContaining({
      runtimeApplied: false,
      ignoredOverlayKeys: ['thin-overlay-must-not-apply'],
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-thin-residual-overlay',
      predictedDurationDays: 10,
    }))
  })

  it('prefers mature company residual overlays over project-local overlays for coarse-first runtime calibration', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 26,
    })
    state.modelProfiles = [{
      id: 'profile-residual-overlay-coarse-first',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'residual_overlay_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.projects = [{
      id: 'project-coarse-first-overlay',
      company_id: 'company-coarse-first',
    }]
    state.tasks = [{
      id: 'task-coarse-first-overlay',
      project_id: 'project-coarse-first-overlay',
      title: 'Generic linear task',
      standard_work_code: 'generic_linear_task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-06-06',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]
    state.residualOverlays = [{
      overlay_key: 'project-fine-overlay-plus-nine',
      asset_key: 'task_remaining_forecast',
      scope_level: 'project',
      company_id: 'company-coarse-first',
      project_id: 'project-coarse-first-overlay',
      learning_target: 'forecast_residual',
      learning_maturity: 'guarded_live_tuning',
      publish_anchor: 'guarded_runtime_auto_publish',
      automation_maturity: 'auto_canary',
      runtime_publication_status: 'canary',
      original_mae: 8,
      overlay_mae: 1,
      mae_improvement_ratio: 0.875,
      overcompensation_ratio: 0.08,
      residual_payload: { residualCorrectionDays: 9, sampleCount: 12 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      publication_key: 'forecast_residual_overlay_runtime:project-fine-plus-nine',
      rollback_target: { action: 'disable_overlay', overlayKey: 'project-fine-overlay-plus-nine' },
    }, {
      overlay_key: 'company-coarse-overlay-plus-two',
      asset_key: 'task_remaining_forecast',
      scope_level: 'company',
      company_id: 'company-coarse-first',
      project_id: null,
      learning_target: 'forecast_residual',
      learning_maturity: 'guarded_live_tuning',
      publish_anchor: 'guarded_runtime_auto_publish',
      automation_maturity: 'auto_publish',
      runtime_publication_status: 'published',
      original_mae: 7,
      overlay_mae: 4,
      mae_improvement_ratio: 0.43,
      overcompensation_ratio: 0.1,
      residual_payload: { residualCorrectionDays: 2, sampleCount: 18 },
      writes_base_duration_seed: false,
      target_table: 'duration_forecast_residual_overlays',
      publication_key: 'forecast_residual_overlay_runtime:company-coarse-plus-two',
      rollback_target: { action: 'disable_overlay', overlayKey: 'company-coarse-overlay-plus-two' },
    }]

    const forecast = await forecastTaskDuration('task-coarse-first-overlay')

    expect(forecast.remainingDurationDays).toBe(12)
    expect(forecast.forecastSources?.residualOverlay).toEqual(expect.objectContaining({
      runtimeApplied: true,
      overlayKey: 'company-coarse-overlay-plus-two',
      scopeLevel: 'company',
      sampleCount: 18,
      minSampleCount: 10,
    }))
  })

  it('does not apply project forecast overlays before the minimum forecast-error sample gate is met', async () => {
    state.modelProfiles = [{
      id: 'profile-thin-project-overlay',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'project_overlay_sample_gate_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.projectOverlays = [{
      id: 'thin-project-overlay-1',
      project_id: 'project-thin-project-overlay',
      model_key: 'remaining_duration_forecast',
      model_version: 'project_overlay_sample_gate_v1',
      overlay_status: 'candidate',
      sample_count: 1,
      mean_absolute_error_days: 8,
      bias_error_days: 6,
      threshold_overlay: {
        confidenceWeightMultiplier: 0.5,
        candidateWeights: {
          L0: { reference_ratio: 1 },
          L1: { reference_ratio: 0, spi_eac: 0, recent_velocity: 1, history_velocity: 0 },
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 1, history_velocity: 0 },
        },
      },
      metadata: {
        generatedBy: 'test',
      },
    }]
    state.tasks = [{
      id: 'task-thin-project-overlay',
      project_id: 'project-thin-project-overlay',
      title: 'Thin project overlay must not steer forecast',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]
    state.snapshots = [
      { task_id: 'task-thin-project-overlay', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-thin-project-overlay', progress: 25, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-thin-project-overlay', progress: 50, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-thin-project-overlay')

    expect(forecast.remainingDurationDays).toBe(5)
    expect(forecast.forecastSources?.modelProfile).toEqual(expect.objectContaining({
      source: 'table',
      projectOverlay: expect.objectContaining({
        runtimeApplied: false,
        ignoredReason: 'project_forecast_overlay_sample_gate_not_met',
        sampleCount: 1,
        minSampleCount: 5,
      }),
    }))
    expect((forecast.forecastSources?.confidenceInputs as any)?.modelConfidenceWeight).toBe(1)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-thin-project-overlay',
      predictedDurationDays: 5,
    }))
  })

  it('applies project forecast overlays after the forecast-error sample gate is met', async () => {
    state.modelProfiles = [{
      id: 'profile-mature-project-overlay',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'project_overlay_sample_gate_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.projectOverlays = [{
      id: 'mature-project-overlay-1',
      project_id: 'project-mature-project-overlay',
      model_key: 'remaining_duration_forecast',
      model_version: 'project_overlay_sample_gate_v1',
      overlay_status: 'active_candidate',
      sample_count: 5,
      mean_absolute_error_days: 8,
      bias_error_days: 6,
      threshold_overlay: {
        confidenceWeightMultiplier: 0.5,
        candidateWeights: {
          L0: { reference_ratio: 1 },
          L1: { reference_ratio: 0, spi_eac: 0, recent_velocity: 1, history_velocity: 0 },
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 1, history_velocity: 0 },
        },
      },
      metadata: {
        generatedBy: 'test',
      },
    }]
    state.tasks = [{
      id: 'task-mature-project-overlay',
      project_id: 'project-mature-project-overlay',
      title: 'Mature project overlay can steer forecast',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]
    state.snapshots = [
      { task_id: 'task-mature-project-overlay', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-mature-project-overlay', progress: 25, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-mature-project-overlay', progress: 50, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-mature-project-overlay')

    expect(forecast.remainingDurationDays).toBe(18)
    expect(forecast.forecastSources?.modelProfile).toEqual(expect.objectContaining({
      source: 'table_project_overlay',
      projectOverlay: expect.objectContaining({
        runtimeApplied: true,
        sampleCount: 5,
        minSampleCount: 5,
      }),
    }))
    expect((forecast.forecastSources?.confidenceInputs as any)?.modelConfidenceWeight).toBe(0.5)
  })

  it('records learnable parameter governance state with task remaining forecast predictions', async () => {
    state.modelProfiles = [{
      id: 'profile-parameter-governance',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'parameter_governance_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
        progressCurvePolicies: {
          linear: [{ multiplier: 1 }],
        },
      },
    }]
    state.tasks = [{
      id: 'task-parameter-governance',
      project_id: 'project-1',
      title: 'Parameter governed task',
      standard_work_code: 'generic_linear_task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-27',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-parameter-governance')

    expect(forecast.forecastSources?.learnableParameterRegistry).toEqual(expect.objectContaining({
      ownerAlgorithm: 'taskDurationForecastService',
      parameterKeys: expect.arrayContaining([
        'forecast.L0.candidate_weight',
        'forecast.progress_curve_multiplier',
        'forecast.confidence_penalty',
      ]),
      parameters: expect.arrayContaining([
        expect.objectContaining({
          parameterKey: 'forecast.progress_curve_multiplier',
          learningMaturity: 'governed_candidate',
          publishAnchor: 'manual_governance_required',
          runtimeConsumable: false,
        }),
      ]),
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-parameter-governance',
      predictionContext: expect.objectContaining({
        learnableParameterRegistry: expect.objectContaining({
          parameterKeys: expect.arrayContaining(['forecast.progress_curve_multiplier']),
        }),
      }),
    }))
  })

  it('records runtime consumption gate blocks for manually governed forecast parameters instead of applying publication rows', async () => {
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockImplementation(async (input: any) => ({
      status: input.parameterKey === 'forecast.L2.candidate_weight'
        ? 'runtime_parameter_blocked'
        : 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: input.parameterKey,
      runtimeValue: null,
      consumptionMode: 'stable',
      publicationKey: input.parameterKey === 'forecast.L2.candidate_weight'
        ? 'learnable-parameter-runtime:forecast-l2:system_seed'
        : null,
      publicationStatus: input.parameterKey === 'forecast.L2.candidate_weight' ? 'published' : null,
      scopeLevel: input.parameterKey === 'forecast.L2.candidate_weight' ? 'system' : null,
      companyId: null,
      projectId: null,
      rollbackTarget: input.parameterKey === 'forecast.L2.candidate_weight'
        ? 'forecast.L2.candidate_weight.default'
        : null,
      reasons: input.parameterKey === 'forecast.L2.candidate_weight'
        ? [
          'parameter_learning_maturity_does_not_allow_runtime_consumption',
          'manual_or_system_curated_publish_anchor_requires_governance_package',
        ]
        : ['runtime_parameter_publication_not_found'],
      writesSeedRuntimeDirectly: false,
    }))
    state.modelProfiles = [{
      id: 'profile-runtime-gate',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 0.6, spi_eac: 0.4, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 0.25, spi_eac: 0.25, recent_velocity: 0.25, history_velocity: 0.25 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-forecast-runtime-gate',
      project_id: 'project-1',
      title: 'Runtime gate forecast task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-forecast-runtime-gate')

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith(expect.objectContaining({
      parameterKey: 'forecast.L2.candidate_weight',
      allowSystemScope: true,
    }))
    expect(forecast.forecastSources?.learnableParameterRuntimeGate).toEqual(expect.objectContaining({
      ownerAlgorithm: 'taskDurationForecastService',
      appliedRuntimeParameterCount: 0,
      blockedRuntimeParameterCount: expect.any(Number),
      parameters: expect.arrayContaining([
        expect.objectContaining({
          parameterKey: 'forecast.L2.candidate_weight',
          runtimeConsumable: false,
          publicationKey: 'learnable-parameter-runtime:forecast-l2:system_seed',
          reasons: expect.arrayContaining([
            'manual_or_system_curated_publish_anchor_requires_governance_package',
          ]),
          appliedToForecast: false,
        }),
      ]),
    }))
    expect(forecast.forecastSources?.modelProfile).toEqual(expect.objectContaining({
      source: 'table',
    }))
  })

  it('applies scoped guarded live confidence-weight parameters to task remaining forecasts', async () => {
    mocks.loadAlgorithmAssetLearnableParameterRuntimeValue.mockImplementation(async (input: any) => {
      if (input.parameterKey === 'forecast.confidence_weight_multiplier') {
        return {
          status: 'runtime_parameter_consumable',
          runtimeConsumable: true,
          parameterKey: input.parameterKey,
          runtimeValue: 0.5,
          consumptionMode: input.consumptionMode ?? 'stable',
          publicationKey: 'learnable-parameter-runtime:forecast-confidence-weight:company_override',
          publicationStatus: 'published',
          scopeLevel: 'company',
          companyId: 'company-runtime',
          projectId: null,
          rollbackTarget: 'forecast.confidence_weight_multiplier.default',
          reasons: [],
          writesSeedRuntimeDirectly: false,
        }
      }
      return {
        status: 'runtime_parameter_not_found',
        runtimeConsumable: false,
        parameterKey: input.parameterKey,
        runtimeValue: null,
        consumptionMode: input.consumptionMode ?? 'stable',
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: input.companyId ?? null,
        projectId: input.projectId ?? null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_publication_not_found'],
        writesSeedRuntimeDirectly: false,
      }
    })
    state.projects = [{
      id: 'project-runtime',
      company_id: 'company-runtime',
    }]
    state.modelProfiles = [{
      id: 'profile-runtime-confidence',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'runtime_confidence_weight_contract_v1',
        candidateWeights: {
          L0: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
          L2: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-runtime-confidence',
      project_id: 'project-runtime',
      title: 'Runtime confidence parameter task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-27',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-runtime-confidence')

    expect(mocks.loadAlgorithmAssetLearnableParameterRuntimeValue).toHaveBeenCalledWith(expect.objectContaining({
      parameterKey: 'forecast.confidence_weight_multiplier',
      companyId: 'company-runtime',
      projectId: 'project-runtime',
      allowSystemScope: true,
    }))
    expect(forecast.forecastSources?.learnableParameterRuntimeGate).toEqual(expect.objectContaining({
      appliedRuntimeParameterCount: 1,
      parameters: expect.arrayContaining([
        expect.objectContaining({
          parameterKey: 'forecast.confidence_weight_multiplier',
          runtimeConsumable: true,
          runtimeValue: 0.5,
          scopeLevel: 'company',
          appliedToForecast: true,
        }),
      ]),
    }))
    expect((forecast.forecastSources?.confidenceInputs as any)?.modelConfidenceWeight).toBe(0.5)
    expect((forecast.forecastSources?.modelProfile as any)?.runtimeLearnableParameters).toEqual(expect.objectContaining({
      'forecast.confidence_weight_multiplier': expect.objectContaining({
        publicationKey: 'learnable-parameter-runtime:forecast-confidence-weight:company_override',
        scopeLevel: 'company',
        runtimeValue: 0.5,
        beforeConfidenceWeight: 1,
        afterConfidenceWeight: 0.5,
      }),
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-runtime-confidence',
      predictionContext: expect.objectContaining({
        forecastSources: expect.objectContaining({
          learnableParameterRuntimeGate: expect.objectContaining({
            appliedRuntimeParameterCount: 1,
          }),
        }),
      }),
    }))
  })

  it('uses live project generation facts for execution reference forecasts without mutating frozen task metadata', async () => {
    state.projects = [{
      id: 'project-1',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'steel_structure',
          methodVariantCodes: ['modular_mic'],
          totalAreaM2: 32000,
          buildingCount: 4,
          highestBuildingFloorCount: 16,
        },
      },
    }]
    state.tasks = [{
      id: 'task-live-facts',
      project_id: 'project-1',
      title: 'Factory installed module lift',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 40,
      standard_task_metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'cast_in_place',
          methodVariantCodes: ['cast_in_place'],
          totalAreaM2: 180000,
          buildingCount: 8,
          highestBuildingFloorCount: 33,
        },
      },
    }]

    await forecastTaskDuration('task-live-facts')

    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      suggestionPurpose: 'execution_reference',
      projectGenerationFacts: expect.objectContaining({
        totalAreaM2: 32000,
        buildingCount: 4,
        highestBuildingFloorCount: 16,
        structureTypeCode: 'steel_structure',
        businessType: 'residential',
        methodVariantCodes: ['modular_mic'],
      }),
      structureTypeCode: 'steel_structure',
      methodVariantCodes: ['modular_mic'],
    }))
    expect(state.tasks[0].standard_task_metadata).toEqual(expect.objectContaining({
      projectGenerationFacts: expect.objectContaining({
        totalAreaM2: 180000,
        structureTypeCode: 'cast_in_place',
      }),
    }))
  })

  it('hydrates duration suggestions with current progress and obstacle facts before forecasting', async () => {
    state.tasks = [{
      id: 'task-current-runtime-facts',
      project_id: 'project-1',
      title: 'Current runtime facts task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-02',
      progress: 45,
    }]
    state.snapshots = [{
      task_id: 'task-current-runtime-facts',
      progress: 45,
      snapshot_date: '2026-05-18',
      created_at: '2026-05-18T08:00:00.000Z',
    }]
    state.obstacles = [{
      id: 'obstacle-current-runtime-facts',
      task_id: 'task-current-runtime-facts',
      status: 'open',
      severity: 'high',
      created_at: '2026-05-17T08:00:00.000Z',
    }]

    await forecastTaskDuration('task-current-runtime-facts')

    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledTimes(1)
    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      runtimeExecutionFacts: expect.objectContaining({
        progressCompletionRatio: 0.45,
        blockedTaskCount: 1,
        hardBlockerCount: 1,
        evidenceCodes: expect.arrayContaining(['progress_snapshots', 'open_obstacles']),
      }),
    }))
  })

  it('uses SPI and recent velocity when execution facts show the task is slower than the reference ratio', async () => {
    state.tasks = [{
      id: 'task-1',
      project_id: 'project-1',
      title: 'Concrete pour zone A',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 20,
    }]
    state.snapshots = [
      { task_id: 'task-1', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-1', progress: 10, snapshot_date: '2026-05-08', created_at: '2026-05-08T08:00:00.000Z' },
      { task_id: 'task-1', progress: 20, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-1')

    expect(forecast.forecastSource).toBe('standard_work_duration_seed')
    expect(forecast.remainingDurationDays).not.toBeNull()
    expect(forecast.optimisticRemainingDays).toBe(8)
    expect(forecast.remainingDurationDays).toBeGreaterThanOrEqual(20)
    expect(forecast.conservativeRemainingDays).toBeGreaterThan(forecast.remainingDurationDays ?? 0)
    expect(forecast.dataMaturity).toBe('L1')
    expect(forecast.topFactors).toEqual(expect.arrayContaining([
      '实际进展慢于计划节奏，预计剩余时间需要上调。',
      '最近进度快照显示现场推进速度偏慢。',
    ]))
    expect(forecast.forecastSources?.forecastPaths).toMatchObject({
      optimistic: expect.objectContaining({ basis: '参考工期 + 硬性起算等待' }),
      recommended: expect.objectContaining({ basis: '候选加权 + 工序曲线 + 现场影响' }),
      conservative: expect.objectContaining({ basis: '保守参考工期 + 全部现场风险 + 低置信缓冲' }),
    })
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 8 }),
      expect.objectContaining({ key: 'spi_eac' }),
      expect.objectContaining({ key: 'recent_velocity' }),
    ]))
    expect(forecast.forecastSources?.candidateSpread).toMatchObject({
      ratio: expect.any(Number),
      confidenceDelta: expect.any(Number),
    })
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'forecast_candidate_spread' }),
    ]))
    expect(state.insertedForecasts[0]?.calculation_context).toMatchObject({
      execution_reference_days: 10,
      reference_duration_lifecycle: expect.objectContaining({
        storageField: 'task_duration_forecasts.execution_reference_days',
        recommendedDurationDaysPolicy: 'new_task_reference_only_not_written_by_execution_forecast',
      }),
      remaining_duration_forecast: expect.objectContaining({
        dataMaturity: 'L1',
      }),
    })
    expect(state.insertedForecasts[0]?.execution_reference_days).toBe(10)
    expect(state.insertedForecasts[0]).not.toHaveProperty('recommended_duration_days')
    expect(forecast.executionReferenceDays).toBe(10)
    expect(forecast.confidenceScore).not.toBe(62)
    expect(state.insertedForecasts[0]?.confidence_score).toBe(forecast.confidenceScore)
  })

  it('routes gate-style acceptance and handover tasks away from SPI/EAC extrapolation', async () => {
    state.tasks = [{
      id: 'task-gate-style',
      project_id: 'project-1',
      title: '系统调试验收资料移交',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-12',
      actual_start_date: '2026-05-01',
      progress: 20,
      acceptance_required: true,
      material_required: true,
      standard_task_metadata: {
        durationContributionMode: 'quality_gate',
        qualityControlRole: 'acceptance_gate',
        inspectionAcceptanceRole: 'special_acceptance',
        documentEvidenceRole: 'handover_document',
      },
    }]
    state.conditions = [{
      id: 'condition-1',
      project_id: 'project-1',
      task_id: 'task-gate-style',
      condition_type: 'acceptance',
      name: '系统调试验收移交资料',
      status: 'pending',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      target_date: '2026-05-25',
    }]
    state.acceptancePlans = [{
      id: 'acceptance-plan-1',
      project_id: 'project-1',
      status: 'pending',
      planned_date: '2026-05-24',
      actual_date: null,
      gate_hint: 'acceptance',
      blocked_requirement_count: 1,
      upstream_unfinished_count: 1,
      requirement_ready_percent: 40,
      is_overdue: false,
    }]
    state.projectEntityLinks = [{
      project_id: 'project-1',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'acceptance-plan-1',
      target_entity_type: 'task',
      target_entity_id: 'task-gate-style',
      relation_type: 'covers_task',
      status: 'active',
    }]

    const forecast = await forecastTaskDuration('task-gate-style')

    const candidateKeys = (forecast.forecastSources?.candidates as Array<{ key: string }> | undefined)
      ?.map((candidate) => candidate.key) ?? []

    expect(candidateKeys).toEqual(expect.arrayContaining(['reference_ratio']))
    expect(candidateKeys).not.toContain('spi_eac')
    expect(candidateKeys).not.toContain('recent_velocity')
    expect(candidateKeys).not.toContain('history_velocity')
    expect(forecast.forecastSources).toEqual(expect.objectContaining({
      taskSemanticMode: 'gate_status_date',
      gateRelation: 'acceptance_gate',
    }))
    expect(Number(forecast.forecastSources?.acceptanceFinishWaitDays ?? 0)).toBeGreaterThan(0)
    expect(Number(forecast.forecastSources?.acceptanceFinishRemainingDays ?? 0)).toBeGreaterThan(0)
  })

  it('passes projectGenerationFacts snapshot into remaining duration reference suggestion', async () => {
    state.tasks = [{
      id: 'task-facts-forecast',
      project_id: 'project-1',
      title: 'Hospital cleanroom commissioning',
      standard_work_code: 'cleanroom_hvac_commissioning',
      wbs_node_type: 'process',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
      standard_task_metadata: {
        projectGenerationFacts: {
          businessType: 'hospital',
          businessSubtype: 'grade_a_hospital',
          deliveryStandard: 'commissioning_ready',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['cleanroom'],
          prefabRate: 35,
          totalAreaM2: 120000,
          basementAreaM2: 28000,
          highestBuildingFloorCount: 18,
          basementLevelCount: 2,
          foundationDepthM: 12,
          functionalCategoryCodes: ['surgery', 'icu'],
          specialRoomTypeCodes: ['operating_room', 'negative_pressure_room'],
          externalInterfaceCodes: ['medical_gas_acceptance'],
          hardConstraintCodes: ['infection_control_commissioning'],
        },
      },
    }]
    state.snapshots = [
      { task_id: 'task-facts-forecast', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-facts-forecast', progress: 50, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    await forecastTaskDuration('task-facts-forecast')

    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-facts-forecast',
      projectTypeCode: 'hospital',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['cleanroom'],
      projectGenerationFacts: expect.objectContaining({
        businessType: 'hospital',
        businessSubtype: 'grade_a_hospital',
        deliveryStandard: 'commissioning_ready',
        prefabRate: 35,
        totalAreaM2: 120000,
        basementAreaM2: 28000,
        highestBuildingFloorCount: 18,
        basementLevelCount: 2,
        foundationDepthM: 12,
        functionalCategoryCodes: ['surgery', 'icu'],
        specialRoomTypeCodes: ['operating_room', 'negative_pressure_room'],
        externalInterfaceCodes: ['medical_gas_acceptance'],
        hardConstraintCodes: ['infection_control_commissioning'],
      }),
    }))
  })

  it('uses the effective contribution ledger instead of raw context factors for forecast context impact', async () => {
    vi.setSystemTime(new Date('2026-05-11T08:00:00.000Z'))
    state.tasks = [{
      id: 'task-ledger-forecast',
      project_id: 'project-1',
      title: 'Ledger governed task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]
    state.snapshots = [
      { task_id: 'task-ledger-forecast', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-ledger-forecast', progress: 50, snapshot_date: '2026-05-11', created_at: '2026-05-11T08:00:00.000Z' },
    ]
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 24,
      confidenceScore: 70,
      factorSummary: {
        contextVersion: 'v1.4.7.4',
        multiplier: 1,
        extraDays: 0,
        confidenceDelta: -3,
        rawConfidenceDelta: -3,
        adjustedBy: ['resource_conflict'],
        factors: [
          {
            key: 'resource_conflict',
            label: 'site capacity pressure',
            multiplier: 1.25,
            extraDays: 6,
            confidenceDelta: -8,
            actionPolicy: 'candidate_only',
            source: 'task_fact',
            reason: 'raw duplicated pressure',
          },
        ],
        businessReasons: ['raw duplicated pressure'],
        hasLowConfidenceSignal: false,
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['resource_conflict'],
          confidence_level: 'medium',
          factor_summary_available: true,
          factor_contribution_ledger: [
            {
              key: 'resource_conflict',
              label: 'site capacity pressure',
              multiplier: 1,
              originalMultiplier: 1.25,
              extraDays: 0,
              originalExtraDays: 6,
              confidenceDelta: -3,
              originalConfidenceDelta: -8,
              actionPolicy: 'candidate_only',
              source: 'task_fact',
              contributionMode: 'deduped_secondary',
              scopeFingerprint: 'project-1:task-ledger-forecast',
              sourceEntityKeys: ['task_condition:condition-1'],
              dedupeKey: 'resource_conflict:task_condition:condition-1',
              dataDependencies: ['tasks'],
              reason: 'raw duplicated pressure',
              suppressedByFactorKey: 'external_readiness',
            },
          ],
        },
      },
    })

    const forecast = await forecastTaskDuration('task-ledger-forecast')

    expect(forecast.forecastSources?.impactModeBreakdown).toMatchObject({
      context: expect.objectContaining({
        add_days: 0,
        multiplier: 1,
        confidence_delta: -3,
      }),
    })
  })

  it('persists factor summary with effective contribution ledger for downstream recomputation contracts', async () => {
    state.tasks = [{
      id: 'task-factor-summary-contract',
      project_id: 'project-1',
      title: 'Contract task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 40,
    }]
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      factorSummary: {
        ...baseSuggestion().factorSummary,
        contextVersion: 'v1.4.7.4',
        multiplier: 1.1,
        extraDays: 1,
        confidenceDelta: -4,
        adjustedBy: ['workflow_sequence'],
        factors: [],
        businessReasons: [],
        hasLowConfidenceSignal: false,
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['workflow_sequence'],
          confidence_level: 'medium',
          factor_summary_available: true,
          factor_contribution_ledger: [
            {
              key: 'workflow_sequence',
              label: 'workflow sequence',
              multiplier: 1,
              extraDays: 1,
              confidenceDelta: -4,
              actionPolicy: 'auto_apply',
              source: 'task_fact',
              contributionMode: 'extra_days',
              scopeFingerprint: 'project-1:task-factor-summary-contract',
              sourceEntityKeys: [],
              dedupeKey: 'workflow_sequence:task_fact',
              dataDependencies: ['task_dependencies'],
              reason: 'workflow lag',
            },
          ],
        },
      },
    })

    await forecastTaskDuration('task-factor-summary-contract')

    expect(state.insertedForecasts[0]?.factor_summary).toEqual(expect.objectContaining({
      calculationContext: expect.objectContaining({
        factor_contribution_ledger: expect.arrayContaining([
          expect.objectContaining({ key: 'workflow_sequence', extraDays: 1 }),
        ]),
      }),
    }))
  })

  it('calculates SPI/EAC remaining days from effective construction days instead of management workdays', async () => {
    vi.setSystemTime(new Date('2026-06-08T08:00:00.000Z'))
    state.tasks = [{
      id: 'task-spi',
      project_id: 'project-1',
      title: 'Typical twelve production day task',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-12',
      actual_start_date: '2026-06-01',
      progress: 30,
    }]
    state.snapshots = [
      { task_id: 'task-spi', progress: 0, snapshot_date: '2026-06-01', created_at: '2026-06-01T08:00:00.000Z' },
      { task_id: 'task-spi', progress: 30, snapshot_date: '2026-06-08', created_at: '2026-06-08T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-spi')

    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'spi_eac', days: 19 }),
    ]))
  })

  it('applies the progress curve to SPI/EAC so it cannot dilute an S-curve body', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    state.tasks = [{
      id: 'task-spi-s-curve',
      project_id: 'project-1',
      title: 'MEP installation task',
      standard_work_code: 'mep_installation_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 70,
    }]

    const forecast = await forecastTaskDuration('task-spi-s-curve')

    expect(forecast.forecastSources?.curveType).toBe('s_curve')
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 8 }),
      expect.objectContaining({ key: 'spi_eac', days: 10 }),
    ]))
  })

  it('orders forecast path durations so the optimistic path cannot exceed the recommended remaining forecast', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 55,
      conservativeDurationDays: 70,
    })
    state.tasks = [{
      id: 'task-s-curve-optimistic-order',
      project_id: 'project-1',
      title: 'MEP installation task',
      standard_work_code: 'mep_installation_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      progress: 70,
    }]

    const forecast = await forecastTaskDuration('task-s-curve-optimistic-order')

    expect(forecast.optimisticRemainingDays).toBeLessThanOrEqual(forecast.remainingDurationDays ?? 0)
    expect(forecast.forecastSources?.forecastPaths).toMatchObject({
      optimistic: { remainingDays: forecast.optimisticRemainingDays },
      recommended: { remainingDays: forecast.remainingDurationDays },
    })
    expect((forecast.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.forecast_paths.optimistic_order',
        severity: 'warning',
      }),
    ]))
  })

  it('keeps an SPI/EAC remaining candidate after planned value reaches 100 percent but work is unfinished', async () => {
    vi.setSystemTime(new Date('2026-06-20T08:00:00.000Z'))
    state.tasks = [{
      id: 'task-spi-boundary',
      project_id: 'project-1',
      title: 'Overdue unfinished SPI task',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-10',
      actual_start_date: '2026-06-01',
      progress: 80,
    }]
    state.snapshots = [
      { task_id: 'task-spi-boundary', progress: 0, snapshot_date: '2026-06-01', created_at: '2026-06-01T08:00:00.000Z' },
      { task_id: 'task-spi-boundary', progress: 80, snapshot_date: '2026-06-20', created_at: '2026-06-20T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-spi-boundary')

    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'spi_eac', days: 2 }),
    ]))
  })

  it('treats weekends as normal construction days and skips the Spring Festival shutdown window', async () => {
    vi.setSystemTime(new Date('2026-02-14T08:00:00.000Z'))
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 3,
      conservativeDurationDays: 3,
    })
    state.seedRecords = [{
      holidayCode: 'spring_festival_2026',
      holidayName: 'Spring Festival construction shutdown',
      year: 2026,
      month: 2,
      startDate: '2026-02-15',
      endDate: '2026-02-23',
      adjustedWorkDates: ['2026-02-14', '2026-02-28'],
      productivity: 0.45,
    }]
    state.tasks = [{
      id: 'task-spring',
      project_id: 'project-1',
      title: 'Spring Festival boundary task',
      planned_start_date: '2026-02-14',
      planned_end_date: '2026-02-20',
      progress: 0,
    }]

    const forecast = await forecastTaskDuration('task-spring')

    expect(forecast.forecastFinishDate).toBe('2026-02-25')
    expect(forecast.forecastDelayDays).toBe(2)
    expect(forecast.forecastSources?.calendarBasis).toBe('official_construction_calendar_seed')
    expect(forecast.forecastSources?.calendarWindowCount).toBe(1)
  })

  it('skips explicit non-spring construction shutdown windows in forecast finish dates', async () => {
    vi.setSystemTime(new Date('2026-05-01T08:00:00.000Z'))
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 3,
      conservativeDurationDays: 3,
    })
    state.seedRecords = [{
      holidayCode: 'project_shutdown_2026',
      holidayName: 'Project-level construction shutdown',
      calendarKind: 'forecast_calendar_window',
      startDate: '2026-05-02',
      endDate: '2026-05-03',
      counts_as_construction_shutdown: true,
      productivity: 0,
    }]
    state.tasks = [{
      id: 'task-explicit-shutdown',
      project_id: 'project-1',
      title: 'Explicit shutdown boundary task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-03',
      progress: 0,
    }]

    const forecast = await forecastTaskDuration('task-explicit-shutdown')

    expect(forecast.forecastFinishDate).toBe('2026-05-05')
    expect(forecast.forecastDelayDays).toBe(2)
    expect(forecast.forecastSources?.calendarBasis).toBe('official_construction_calendar_seed')
    expect(forecast.forecastSources?.calendarWindowCount).toBe(1)
  })

  it('does not skip climate windows as construction shutdown days', async () => {
    vi.setSystemTime(new Date('2026-06-01T08:00:00.000Z'))
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 3,
      conservativeDurationDays: 3,
    })
    state.seedRecords = [{
      holidayCode: 'plum_rain_2026_forecast',
      holidayName: 'Plum-rain construction calendar window',
      calendarKind: 'plum_rain_window',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      productivity: 0.8,
    }]
    state.tasks = [{
      id: 'task-climate-window',
      project_id: 'project-1',
      title: 'Climate window boundary task',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-03',
      progress: 0,
    }]

    const forecast = await forecastTaskDuration('task-climate-window')

    expect(forecast.forecastFinishDate).toBe('2026-06-03')
    expect(forecast.forecastDelayDays).toBe(0)
    expect(forecast.forecastSources?.calendarBasis).toBe('official_construction_calendar_seed')
    expect(forecast.forecastSources?.calendarWindowCount).toBe(1)
  })

  it('decays missed-start confidence penalty after the Spring Festival shutdown window has passed', async () => {
    vi.setSystemTime(new Date('2026-03-02T08:00:00.000Z'))
    state.seedRecords = [{
      holidayCode: 'spring_festival_2026',
      holidayName: 'Spring Festival construction shutdown',
      year: 2026,
      month: 2,
      startDate: '2026-02-15',
      endDate: '2026-02-23',
      calendarKind: 'statutory_holiday',
      productivity: 0.45,
    }]
    state.tasks = [{
      id: 'task-spring-unstarted',
      project_id: 'project-1',
      title: 'Spring Festival unstarted task',
      planned_start_date: '2026-02-18',
      planned_end_date: '2026-02-20',
      progress: 0,
    }]

    const forecast = await forecastTaskDuration('task-spring-unstarted')
    const rule = forecast.forecastSources?.unstartedOverdueRule as any

    expect(rule).toMatchObject({
      applies: true,
      missedWindowPenaltyDecayApplied: true,
      missedWindowPenaltyDecayRatio: 0.5,
      missedWindowPenaltyDecayReason: 'spring_festival_post_window_penalty_decay',
    })
    expect(rule.effectiveMissedWindowConfidencePenalty).toBe(Math.ceil(rule.rawMissedWindowConfidencePenalty * 0.5))
    expect(rule.effectiveMissedWindowConfidencePenalty).toBeLessThan(rule.rawMissedWindowConfidencePenalty)
    expect(rule.confidenceDelta).toBeLessThan(0)
    expect(rule.confidenceDelta).toBeLessThanOrEqual(-rule.effectiveMissedWindowConfidencePenalty)
  })

  it('applies a hard floor when a task is stuck near completion', async () => {
    state.tasks = [{
      id: 'task-2',
      project_id: 'project-1',
      title: 'Acceptance closeout',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 90,
    }]
    state.snapshots = [
      { task_id: 'task-2', progress: 90, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-2', progress: 90, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-2')

    expect(forecast.optimisticRemainingDays).toBe(7)
    expect(forecast.remainingDurationDays).toBe(7)
    expect(forecast.forecastSources?.stuckFinishingFloorDays).toBe(7)
    expect(forecast.topFactors?.some((factor) => factor.includes('收尾阶段'))).toBe(true)
  })

  it('uses model-profile stuck finishing policy instead of a fixed hardcoded threshold', async () => {
    state.modelProfiles = [{
      id: 'profile-stuck',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'stuck_policy_test_v1',
        stuckFinishingPolicies: {
          front_heavy: {
            progressThreshold: 80,
            stuckDaysThreshold: 5,
            floorDays: 9,
            criticalStuckDaysThreshold: 20,
            criticalFloorDays: 16,
          },
        },
      },
    }]
    state.tasks = [{
      id: 'task-stuck-policy',
      project_id: 'project-1',
      title: 'Waterproofing closeout',
      standard_work_name: 'waterproofing',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      progress: 82,
    }]
    state.snapshots = [
      { task_id: 'task-stuck-policy', progress: 82, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-stuck-policy', progress: 82, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-stuck-policy')

    expect(forecast.remainingDurationDays).toBeGreaterThanOrEqual(9)
    expect(forecast.forecastSources?.stuckFinishingFloorDays).toBe(9)
    expect(forecast.forecastSources?.modelProfile).toMatchObject({
      version: 'stuck_policy_test_v1',
    })
  })

  it('adds obstacle impact to remaining days and exposes delayRiskIndex while keeping legacy delay_probability', async () => {
    state.tasks = [{
      id: 'task-3',
      project_id: 'project-1',
      title: 'Waterproofing level 2',
      standard_work_name: 'waterproofing',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-10',
      progress: 60,
    }]
    state.snapshots = [
      { task_id: 'task-3', progress: 20, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-3', progress: 45, snapshot_date: '2026-05-14', created_at: '2026-05-14T08:00:00.000Z' },
      { task_id: 'task-3', progress: 60, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]
    state.obstacles = [{
      id: 'obstacle-1',
      task_id: 'task-3',
      status: 'open',
      severity: 'critical',
      created_at: '2026-05-05T08:00:00.000Z',
    }]

    const analysis = await analyzeTaskDelayRiskWithDurationForecast('task-3')

    expect(analysis.duration_forecast.delayRiskIndex).toBeGreaterThan(0)
    expect(analysis.duration_forecast).toMatchObject({
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: expect.any(Number),
    })
    expect(analysis.duration_forecast).not.toHaveProperty('remainingDurationDays')
    expect(analysis.duration_forecast).not.toHaveProperty('remaining_forecast_days')
    expect(analysis.duration_forecast).not.toHaveProperty('duration_output_code')
    expect(analysis.duration_forecast).not.toHaveProperty('duration_output_semantic_field_name')
    expect(analysis.duration_forecast).not.toHaveProperty('recommendedDurationDays')
    expect(analysis.duration_forecast).not.toHaveProperty('optimisticRemainingDays')
    expect(analysis.duration_forecast).not.toHaveProperty('conservativeRemainingDays')
    expect(analysis.duration_forecast).not.toHaveProperty('calculationContext')
    expect(analysis.duration_forecast).not.toHaveProperty('forecastSources')
    expect(analysis.durationOutputCode).toBe('remaining_forecast')
    expect(analysis.durationOutputSemanticFieldName).toBe('remainingForecastDays')
    expect(analysis.remainingForecastDays).toEqual(expect.any(Number))
    expect(analysis).not.toHaveProperty('remaining_days')
    expect(analysis.delay_risk_index).toBe(analysis.delay_probability)
    expect(analysis.risk_factors).toEqual(expect.arrayContaining([
      '存在 1 项未关闭阻碍，已计入执行缓冲和风险判断。',
    ]))
  })

  it('adds a deterministic floor for critical obstacles without a resolve date', async () => {
    state.tasks = [{
      id: 'task-critical-obstacle-floor',
      project_id: 'project-1',
      title: 'Waterproofing blocked by site access',
      standard_work_name: 'waterproofing',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-10',
      progress: 60,
    }]
    state.snapshots = [
      { task_id: 'task-critical-obstacle-floor', progress: 20, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-critical-obstacle-floor', progress: 60, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]
    state.obstacles = [{
      id: 'obstacle-critical-no-date',
      task_id: 'task-critical-obstacle-floor',
      status: 'open',
      severity: 'critical',
      obstacle_type: 'site_access',
      estimated_resolve_date: null,
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-critical-obstacle-floor')

    expect(forecast.forecastSources?.additiveSiteDays).toBeGreaterThanOrEqual(3)
    expect((forecast.forecastSources?.impactModeBreakdown as any).obstacle.add_days).toBeGreaterThanOrEqual(3)
    expect((forecast.forecastSources as any)?.impactSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalId: 'obstacle:obstacle-critical-no-date',
        impactMode: 'add_days',
        severity: 'critical',
      }),
    ]))
  })

  it('propagates unfinished predecessor forecasts into the remaining duration floor', async () => {
    state.tasks = [
      {
        id: 'task-child',
        project_id: 'project-1',
        title: 'Install facade panels',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 0,
      },
      {
        id: 'task-parent',
        project_id: 'project-1',
        title: 'Finish embedded parts',
        planned_start_date: '2026-05-11',
        planned_end_date: '2026-05-15',
        progress: 50,
      },
    ]
    state.dependencies = [{
      task_id: 'task-child',
      project_id: 'project-1',
      dependency_task_id: 'task-parent',
      dependency_type: 'FS',
      lag_days: 2,
      required_for_start: true,
      status: 'active',
    }]
    state.dependencyForecasts = [{
      task_id: 'task-parent',
      project_id: 'project-1',
      forecast_finish_date: '2026-05-29',
      remaining_duration_days: 9,
      forecast_delay_days: 8,
      is_current: true,
    }]

    const forecast = await forecastTaskDuration('task-child')

    expect(forecast.remainingDurationDays).toBeGreaterThan(10)
    expect(forecast.topFactors).toEqual(expect.arrayContaining([
      '有 1 项前置任务未完成，最早可继续施工时间被后移。',
    ]))
    expect(forecast.forecastSources?.dependencyPropagation).toMatchObject({
      count: 1,
      maxWaitDays: expect.any(Number),
      blockingDependencies: expect.arrayContaining([
        expect.objectContaining({
          dependencyTaskId: 'task-parent',
          source: 'current_dependency_forecast',
        }),
      ]),
    })
  })

  it('does not treat SS dependencies as FS waits when the predecessor has already started', async () => {
    state.tasks = [
      {
        id: 'task-ss-child',
        project_id: 'project-1',
        title: 'Start facade panels after embedded parts start',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 0,
      },
      {
        id: 'task-ss-parent',
        project_id: 'project-1',
        title: 'Embedded parts already started',
        planned_start_date: '2026-05-11',
        planned_end_date: '2026-05-25',
        actual_start_date: '2026-05-12',
        progress: 50,
      },
    ]
    state.dependencies = [{
      task_id: 'task-ss-child',
      project_id: 'project-1',
      dependency_task_id: 'task-ss-parent',
      dependency_type: 'SS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
    }]
    state.dependencyForecasts = [{
      task_id: 'task-ss-parent',
      project_id: 'project-1',
      forecast_finish_date: '2026-06-15',
      remaining_duration_days: 20,
      forecast_delay_days: 20,
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-ss-child')

    expect(forecast.forecastSources?.dependencyPropagation).toMatchObject({
      count: 1,
      maxWaitDays: 0,
      blockingDependencies: expect.arrayContaining([
        expect.objectContaining({
          dependencyTaskId: 'task-ss-parent',
          dependencyType: 'SS',
          expectedStartDate: '2026-05-12',
          availableStartDate: '2026-05-12',
          waitDays: 0,
        }),
      ]),
    })
  })

  it('uses FF dependencies as finish gates instead of start waits', async () => {
    state.tasks = [
      {
        id: 'task-ff-child',
        project_id: 'project-1',
        title: 'Finish facade inspection with predecessor finish',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 0,
      },
      {
        id: 'task-ff-parent',
        project_id: 'project-1',
        title: 'Predecessor finish forecast',
        planned_start_date: '2026-05-11',
        planned_end_date: '2026-05-25',
        progress: 50,
      },
    ]
    state.dependencies = [{
      task_id: 'task-ff-child',
      project_id: 'project-1',
      dependency_task_id: 'task-ff-parent',
      dependency_type: 'FF',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
    }]
    state.dependencyForecasts = [{
      task_id: 'task-ff-parent',
      project_id: 'project-1',
      forecast_finish_date: '2026-06-15',
      remaining_duration_days: 20,
      forecast_delay_days: 20,
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-ff-child')

    expect(forecast.remainingDurationDays).toBeGreaterThanOrEqual(29)
    expect(forecast.forecastFinishDate).toBe('2026-06-15')
    expect(forecast.forecastSources?.dependencyPropagation).toMatchObject({
      count: 1,
      maxWaitDays: 0,
      floorRemainingDays: 29,
      blockingDependencies: expect.arrayContaining([
        expect.objectContaining({
          dependencyTaskId: 'task-ff-parent',
          dependencyType: 'FF',
          constraintType: 'finish',
          expectedFinishDate: '2026-06-15',
          requiredFinishDate: '2026-06-15',
          waitDays: 0,
          floorRemainingDays: 29,
        }),
      ]),
    })
  })

  it('uses SF dependencies as predecessor-start to successor-finish gates', async () => {
    state.tasks = [
      {
        id: 'task-sf-child',
        project_id: 'project-1',
        title: 'Finish commissioning after predecessor start window',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 0,
      },
      {
        id: 'task-sf-parent',
        project_id: 'project-1',
        title: 'Predecessor already started',
        planned_start_date: '2026-05-11',
        planned_end_date: '2026-05-25',
        actual_start_date: '2026-05-12',
        progress: 50,
      },
    ]
    state.dependencies = [{
      task_id: 'task-sf-child',
      project_id: 'project-1',
      dependency_task_id: 'task-sf-parent',
      dependency_type: 'SF',
      lag_days: 20,
      required_for_start: true,
      status: 'active',
    }]

    const forecast = await forecastTaskDuration('task-sf-child')

    expect(forecast.remainingDurationDays).toBeGreaterThanOrEqual(15)
    expect(forecast.forecastFinishDate).toBe('2026-06-01')
    expect(forecast.forecastSources?.dependencyPropagation).toMatchObject({
      count: 1,
      maxWaitDays: 0,
      floorRemainingDays: 15,
      blockingDependencies: expect.arrayContaining([
        expect.objectContaining({
          dependencyTaskId: 'task-sf-parent',
          dependencyType: 'SF',
          constraintType: 'finish',
          expectedStartDate: '2026-05-12',
          requiredFinishDate: '2026-06-01',
          waitDays: 0,
          floorRemainingDays: 15,
        }),
      ]),
    })
  })

  it('uses the unstarted-overdue rule as earliest start plus reference execution days', async () => {
    state.tasks = [
      {
        id: 'task-unstarted-overdue',
        project_id: 'project-1',
        title: 'Facade installation not started',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        progress: 0,
      },
      {
        id: 'task-predecessor',
        project_id: 'project-1',
        title: 'Embedded parts handover',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-15',
        progress: 50,
      },
    ]
    state.dependencies = [{
      task_id: 'task-unstarted-overdue',
      project_id: 'project-1',
      dependency_task_id: 'task-predecessor',
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
    }]
    state.dependencyForecasts = [{
      task_id: 'task-predecessor',
      project_id: 'project-1',
      forecast_finish_date: '2026-05-20',
      remaining_duration_days: 3,
      forecast_delay_days: 3,
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
    }]
    state.conditions = [{
      id: 'condition-material-known',
      task_id: 'task-unstarted-overdue',
      condition_type: 'material',
      name: 'Facade panel arrival',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
      source_entity_type: 'project_material',
      source_entity_id: 'material-known',
      expected_date: '2026-05-22',
    }]
    state.obstacles = [{
      id: 'obstacle-known',
      task_id: 'task-unstarted-overdue',
      status: 'open',
      severity: 'critical',
      estimated_resolve_date: '2026-05-25',
      obstacle_type: 'site_access',
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-unstarted-overdue')

    expect(forecast.remainingDurationDays).toBe(17)
    expect(forecast.conservativeRemainingDays).toBe(23)
    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: true,
      stableCode: 'unstarted_overdue_default',
      earliestStartDate: '2026-05-25',
      earliestStartWaitDays: 7,
      unknownBlockerCount: 0,
      noSyntheticUnknownDateDays: true,
    })
    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      plannedStartOverdueWorkdays: expect.any(Number),
      plannedEndOverdueWorkdays: expect.any(Number),
      referenceStalenessRatio: expect.any(Number),
      riskComponents: expect.objectContaining({
        missedWindow: expect.any(Number),
        referenceStaleness: expect.any(Number),
      }),
    })
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'unstarted_overdue_completion_window', severity: 'high' }),
      expect.objectContaining({ type: 'awaiting_earliest_start' }),
      expect.objectContaining({ type: 'execution_reference_stale' }),
    ]))
    expect(forecast.forecastSources?.forecastPaths).toMatchObject({
      recommended: expect.objectContaining({ basis: '最早可开工日 + 执行参考工期' }),
    })
    expect(forecast.topFactors?.some((factor) => factor.includes('最早可开工日'))).toBe(true)
  })

  it('keeps in-progress overdue tasks on execution forecast path while projecting plan delay risk', async () => {
    state.tasks = [{
      id: 'task-in-progress-overdue',
      project_id: 'project-1',
      title: 'Ceiling closeout already started',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-06',
      status: 'in_progress',
      progress: 40,
    }]
    state.snapshots = [
      { task_id: 'task-in-progress-overdue', progress: 0, snapshot_date: '2026-05-06', created_at: '2026-05-06T08:00:00.000Z' },
      { task_id: 'task-in-progress-overdue', progress: 20, snapshot_date: '2026-05-12', created_at: '2026-05-12T08:00:00.000Z' },
      { task_id: 'task-in-progress-overdue', progress: 40, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-in-progress-overdue')

    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: false,
      earliestStartWaitDays: 0,
    })
    expect(forecast.forecastSources?.forecastPaths).toMatchObject({
      recommended: expect.objectContaining({ basis: '候选加权 + 工序曲线 + 现场影响' }),
    })
    expect(forecast.forecastSources?.planRisk).toEqual(expect.objectContaining({
      riskIndexDelta: expect.any(Number),
    }))
    expect(forecast.forecastDelayDays).toBeGreaterThan(0)
    expect(forecast.delayRiskIndex ?? 0).toBeGreaterThan(0)
    expect(forecast.topFactors?.some((factor) => factor.includes('计划'))).toBe(true)
  })

  it('keeps unknown unstarted-overdue blockers as confidence and risk signals only', async () => {
    state.tasks = [{
      id: 'task-unstarted-unknown',
      project_id: 'project-1',
      title: 'Waterproofing not started',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
    }]
    state.conditions = [{
      id: 'condition-unknown',
      task_id: 'task-unstarted-unknown',
      condition_type: 'drawing',
      name: 'Shop drawing approval',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
    }]
    state.materials = [{
      id: 'material-unknown',
      project_id: 'project-1',
      linked_task_id: 'task-unstarted-unknown',
      actual_arrival_date: null,
      expected_arrival_date: null,
      lifecycle_status: 'active',
      record_status: 'active',
    }]
    state.obstacles = [{
      id: 'obstacle-unknown',
      task_id: 'task-unstarted-unknown',
      status: 'open',
      severity: 'critical',
      estimated_resolve_date: null,
      obstacle_type: 'site_access',
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-unstarted-unknown')

    expect(forecast.remainingDurationDays).toBe(10)
    expect(forecast.forecastSources?.additiveSiteDays).toBe(0)
    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: true,
      earliestStartDate: '2026-05-18',
      earliestStartWaitDays: 0,
      unknownBlockerCount: 3,
      noSyntheticUnknownDateDays: true,
    })
    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      unknownCriticalObstacleCount: 1,
      unknownMaterialArrivalCount: 1,
      riskComponents: expect.objectContaining({
        criticalObstacleUnknownDate: expect.any(Number),
        materialUnknownArrival: expect.any(Number),
        unknownDateItems: expect.any(Number),
      }),
    })
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'unknown_start_blocker_dates' }),
    ]))
    expect(forecast.confidenceScore).toBeLessThan(45)
    expect(forecast.delayRiskIndex ?? 0).toBeGreaterThan(0.5)
    expect(forecast.topFactors?.some((factor) => factor.includes('不凭空增加工期'))).toBe(true)
  })

  it('uses dated hard drawing, certificate, and acceptance conditions as earliest start candidates', async () => {
    state.tasks = [{
      id: 'task-unstarted-dated-conditions',
      project_id: 'project-1',
      title: 'Start basement waterproofing',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
    }]
    state.conditions = [
      {
        id: 'condition-drawing',
        task_id: 'task-unstarted-dated-conditions',
        condition_type: 'drawing',
        name: 'Shop drawing approval',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        status: 'open',
        target_date: '2026-05-21',
      },
      {
        id: 'condition-certificate',
        task_id: 'task-unstarted-dated-conditions',
        condition_type: 'certificate',
        name: 'Construction permit condition',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        status: 'open',
        target_date: '2026-05-24',
      },
      {
        id: 'condition-acceptance',
        task_id: 'task-unstarted-dated-conditions',
        condition_type: 'acceptance',
        name: 'Handover acceptance before start',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        status: 'open',
        target_date: '2026-05-23',
      },
    ]
    state.conditions.push({
      id: 'condition-material',
      task_id: 'task-unstarted-dated-conditions',
      condition_type: 'material',
      name: 'Material arrival before start',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
      source_entity_type: 'project_material',
      source_entity_id: 'material-known',
      expected_date: '2026-05-22',
    })

    const forecast = await forecastTaskDuration('task-unstarted-dated-conditions')

    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: true,
      earliestStartDate: '2026-05-24',
      unknownHardConditionCount: 0,
      staleKnownDateCandidateCount: 0,
      noSyntheticUnknownDateDays: true,
    })
    expect((forecast.forecastSources?.unstartedOverdueRule as any)?.knownDateCandidates).toEqual(expect.arrayContaining([
      { source: 'drawing_condition_target_date', date: '2026-05-21' },
      { source: 'certificate_condition_target_date', date: '2026-05-24' },
      { source: 'acceptance_condition_target_date', date: '2026-05-23' },
      { source: 'material_expected_arrival', date: '2026-05-22' },
    ]))
  })

  it('uses task-linked drawing packages, construction drawings, and certificate work items as forecast-only external readiness gates', async () => {
    state.tasks = [{
      id: 'task-linked-source-gates',
      project_id: 'project-1',
      title: 'Start tower superstructure',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
    }]
    state.projectEntityLinks = [
      {
        id: 'link-drawing-package',
        project_id: 'project-1',
        source_entity_type: 'drawing_package',
        source_entity_id: 'drawing-package-1',
        target_entity_type: 'task',
        target_entity_id: 'task-linked-source-gates',
        relation_type: 'blocks_task_start',
        status: 'active',
      },
      {
        id: 'link-construction-drawing',
        project_id: 'project-1',
        source_entity_type: 'construction_drawing',
        source_entity_id: 'drawing-1',
        target_entity_type: 'task',
        target_entity_id: 'task-linked-source-gates',
        relation_type: 'covers_task',
        status: 'active',
      },
      {
        id: 'link-certificate-work-item',
        project_id: 'project-1',
        source_entity_type: 'certificate_work_item',
        source_entity_id: 'certificate-item-1',
        target_entity_type: 'task',
        target_entity_id: 'task-linked-source-gates',
        relation_type: 'blocks_task_start',
        status: 'active',
      },
    ]
    state.drawingPackages = [{
      id: 'drawing-package-1',
      package_code: 'DP-001',
      package_name: 'Tower structure drawing package',
      status: 'pending',
      schedule_impact_flag: true,
      is_ready_for_construction: false,
    }]
    state.constructionDrawings = [
      {
        id: 'drawing-1',
        package_id: 'drawing-package-1',
        drawing_name: 'Tower structure drawing',
        status: '审图中',
        review_status: '审查中',
        schedule_impact_flag: true,
        planned_pass_date: '2026-05-25',
      },
      {
        id: 'drawing-package-current',
        package_id: 'drawing-package-1',
        drawing_name: 'Current package version',
        status: '审图中',
        review_status: '审查中',
        schedule_impact_flag: true,
        planned_pass_date: '2026-05-23',
      },
    ]
    state.certificateWorkItems = [{
      id: 'certificate-item-1',
      item_name: 'Construction permit follow-up',
      status: 'external_submission',
      next_action_due_date: '2026-05-26',
      planned_finish_date: '2026-05-28',
      is_blocked: true,
      block_reason: 'Authority review pending',
    }]

    const forecast = await forecastTaskDuration('task-linked-source-gates')

    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: true,
      earliestStartDate: '2026-05-28',
      unknownHardConditionCount: 0,
    })
    expect((forecast.forecastSources?.unstartedOverdueRule as any)?.knownDateCandidates).toEqual(expect.arrayContaining([
      { source: 'drawing_condition_target_date', date: '2026-05-25' },
      { source: 'certificate_condition_target_date', date: '2026-05-28' },
    ]))
    expect((forecast.forecastSources?.externalReadiness as any)?.forecastOnlyBridgeCounts).toMatchObject({
      drawingPackageScheduleImpact: 1,
      constructionDrawingScheduleImpact: 1,
      certificateWorkItemGate: 1,
    })
    expect((forecast.forecastSources?.externalReadiness as any)?.impactModeBreakdown.forecast_only_bridge_sources).toEqual(expect.arrayContaining([
      'drawing_package_schedule_impact',
      'construction_drawing_schedule_impact',
      'certificate_work_item_gate',
    ]))
  })

  it('escalates unstarted overdue risk beyond the configured missed-start window and caps unknown blocker confidence penalty', async () => {
    state.seedRecords = [{
      stableCode: 'workday-window-2026',
      holidayCode: 'labor_day',
      holidayName: 'Labor Day',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
    }]
    state.tasks = [{
      id: 'task-unstarted-window-overflow',
      project_id: 'project-1',
      title: 'Start basement waterproofing',
      planned_start_date: '2026-03-20',
      planned_end_date: '2026-04-01',
      progress: 0,
    }]
    state.conditions = Array.from({ length: 10 }, (_, index) => ({
      id: `condition-unknown-${index}`,
      task_id: 'task-unstarted-window-overflow',
      condition_type: 'drawing',
      name: `Unknown drawing blocker ${index}`,
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
    }))

    const forecast = await forecastTaskDuration('task-unstarted-window-overflow')
    const rule = forecast.forecastSources?.unstartedOverdueRule as any

    expect(rule).toMatchObject({
      applies: true,
      unknownBlockerCount: 10,
      plannedStartOverdueWorkdays: expect.any(Number),
      riskComponents: expect.objectContaining({
        missedWindow: 0.35,
        missedWindowOverflow: expect.any(Number),
      }),
    })
    expect(rule.riskComponents.missedWindowOverflow).toBeGreaterThan(0)
    expect(rule.confidenceDelta).toBeLessThanOrEqual(-35)
    expect(rule.confidenceDelta).toBeGreaterThan(-60)
  })

  it('treats unresolved past target dates as stale confidence signals instead of earliest start dates', async () => {
    state.tasks = [{
      id: 'task-unstarted-stale-dates',
      project_id: 'project-1',
      title: 'Start facade installation',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      progress: 0,
    }]
    state.conditions = [{
      id: 'condition-stale',
      task_id: 'task-unstarted-stale-dates',
      condition_type: 'drawing',
      name: 'Facade drawing approval',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
      target_date: '2026-05-12',
    }]
    state.materials = [{
      id: 'material-stale',
      project_id: 'project-1',
      linked_task_id: 'task-unstarted-stale-dates',
      actual_arrival_date: null,
      expected_arrival_date: '2026-05-10',
      lifecycle_status: 'active',
      record_status: 'active',
    }]

    const forecast = await forecastTaskDuration('task-unstarted-stale-dates')

    expect(forecast.remainingDurationDays).toBe(10)
    expect(forecast.forecastSources?.unstartedOverdueRule).toMatchObject({
      applies: true,
      earliestStartDate: '2026-05-18',
      earliestStartWaitDays: 0,
      unknownHardConditionCount: 1,
      staleKnownDateCandidateCount: 2,
      noSyntheticUnknownDateDays: true,
    })
    expect((forecast.forecastSources?.unstartedOverdueRule as any)?.knownDateCandidates).toEqual([])
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'stale_start_blocker_dates' }),
    ]))
  })

  it('uses limited dependency depth for batch planning contexts', async () => {
    state.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'Start finish works',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 0,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'Predecessor handover',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 20,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'Upstream inspection',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-22',
        progress: 10,
      },
    ]
    state.dependencies = [
      {
        task_id: 'task-a',
        project_id: 'project-1',
        dependency_task_id: 'task-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        task_id: 'task-b',
        project_id: 'project-1',
        dependency_task_id: 'task-c',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]
    state.dependencyForecasts = [{
      task_id: 'task-c',
      project_id: 'project-1',
      forecast_finish_date: '2026-06-05',
      remaining_duration_days: 14,
      forecast_delay_days: 10,
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-a', { triggerContext: 'monthly_plan_regeneration' })

    expect(forecast.forecastSources?.forecastOptions).toMatchObject({
      triggerContext: 'monthly_plan_regeneration',
      dependencyDepth: 2,
    })
    expect(forecast.forecastSources?.dependencyPropagation).toMatchObject({
      count: 2,
      diagnostics: expect.objectContaining({
        maxDepth: 2,
        depthLimitReached: true,
      }),
      blockingDependencies: expect.arrayContaining([
        expect.objectContaining({ dependencyTaskId: 'task-c' }),
      ]),
    })
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'dependency_structure_diagnostic' }),
    ]))
  })

  it('adds external readiness buffers from unmet conditions, pending materials, and acceptance items', async () => {
    state.tasks = [{
      id: 'task-external',
      project_id: 'project-1',
      title: 'Basement waterproofing',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 40,
    }]
    state.snapshots = [
      { task_id: 'task-external', progress: 20, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-external', progress: 40, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]
    state.conditions = [{
      id: 'condition-1',
      task_id: 'task-external',
      condition_type: 'drawing',
      name: 'Shop drawing approval',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
    }]
    state.materials = [{
      id: 'material-1',
      project_id: 'project-1',
      linked_task_id: 'task-external',
      actual_arrival_date: null,
      expected_arrival_date: '2026-05-16',
      lifecycle_status: 'active',
      record_status: 'active',
    }]
    state.acceptancePlans = [{
      id: 'acceptance-1',
      project_id: 'project-1',
      status: 'pending',
      planned_date: '2026-05-17',
      actual_date: null,
    }]
    state.projectEntityLinks = [{
      project_id: 'project-1',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'acceptance-1',
      target_entity_type: 'task',
      target_entity_id: 'task-external',
      relation_type: 'covers_task',
      status: 'active',
    }]

    const forecast = await forecastTaskDuration('task-external')

    expect(forecast.forecastSources?.externalReadiness).toMatchObject({
      hardUnmetConditionCount: 1,
      drawingConditionCount: 1,
      pendingMaterialCount: 1,
      overdueMaterialCount: 1,
      pendingAcceptanceCount: 1,
      overdueAcceptanceCount: 1,
    })
    expect((forecast.forecastSources as any)?.impactSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceAlgorithm: 'condition',
        impactOwnership: 'condition',
        impactPhase: 'start',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'acceptance',
        impactOwnership: 'acceptance',
      }),
    ]))
    expect((forecast.forecastSources as any)?.impactSignalSummary).toEqual(expect.objectContaining({
      rawCount: expect.any(Number),
      dedupedCount: expect.any(Number),
      confirmedDelayDays: forecast.forecastDelayDays,
      uncertaintyIndex: expect.any(Number),
    }))
    expect(forecast.forecastSources?.externalReadinessImpactDays).toBe(0)
    expect((forecast.forecastSources as any)?.impactSignalSummary).toEqual(expect.objectContaining({
      uncertaintyIndex: expect.any(Number),
      uncertaintyReasons: expect.arrayContaining([
        'stale_known_dates',
        'confidence_only_signals',
      ]),
    }))
    expect(forecast.topFactors).toEqual(expect.arrayContaining([
      '还有 1 项关键开工条件未满足，已计入执行缓冲。',
      '有 1 项关联材料尚未就绪。',
      '有 1 项关联验收事项尚未闭合。',
    ]))
  })

  it('does not double count one shared material blocker across conditions and obstacles', async () => {
    state.tasks = [{
      id: 'task-shared-blocker',
      project_id: 'project-1',
      title: 'Facade installation',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 40,
    }]
    state.snapshots = [
      { task_id: 'task-shared-blocker', progress: 20, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-shared-blocker', progress: 40, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]
    state.conditions = [{
      id: 'condition-material-shared',
      task_id: 'task-shared-blocker',
      condition_type: 'material',
      name: 'Facade panel arrival',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
      source_entity_type: 'project_material',
      source_entity_id: 'material-shared',
      expected_date: '2026-05-24',
    }]
    state.obstacles = [{
      id: 'obstacle-material-shared',
      task_id: 'task-shared-blocker',
      status: 'open',
      severity: 'critical',
      obstacle_type: 'material',
      description: 'Facade panel supplier delay',
      source_entity_type: 'project_material',
      source_entity_id: 'material-shared',
      estimated_resolve_date: '2026-05-24',
      created_at: '2026-05-18T08:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-shared-blocker')
    const signalSummary = (forecast.forecastSources as any)?.impactSignalSummary

    expect(signalSummary).toMatchObject({
      rawCount: 2,
      dedupedCount: 1,
      duplicates: [
        expect.objectContaining({
          dedupeKey: 'blocker:project_material:material-shared:start',
        }),
      ],
    })
    expect((forecast.forecastSources as any)?.impactSignals).toEqual([
      expect.objectContaining({
        sourceEntityType: 'project_material',
        sourceEntityId: 'material-shared',
        impactMode: 'start_wait',
      }),
    ])
    expect(forecast.forecastSources?.siteStartWaitDays).toBe(6)
    expect(forecast.forecastSources?.externalReadinessImpactDays).toBe(0)
    expect(forecast.forecastSources?.obstacleImpactDays).toBe(0)
  })

  it('carries critical-path weighting into the signal-only delay warning summary', async () => {
    state.tasks = [{
      id: 'task-critical-signal-weight',
      project_id: 'project-1',
      title: 'Critical facade installation',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-24',
      actual_start_date: '2026-05-18',
      progress: 35,
      is_critical: true,
      baseline_is_critical: true,
      participant_unit_id: 'unit-facade',
    }]
    state.snapshots = [
      { task_id: 'task-critical-signal-weight', progress: 15, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-critical-signal-weight', progress: 35, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]
    state.conditions = [{
      id: 'condition-critical-material',
      task_id: 'task-critical-signal-weight',
      condition_type: 'material',
      name: 'Curtain wall panel arrival',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      status: 'open',
      source_entity_type: 'project_material',
      source_entity_id: 'material-critical-1',
      expected_date: '2026-05-23',
      participant_unit_id: 'unit-facade',
      responsibility_role: 'supplier_install',
    }]

    const forecast = await forecastTaskDuration('task-critical-signal-weight')
    const signalSummary = (forecast.forecastSources as any)?.impactSignalSummary

    expect(signalSummary).toEqual(expect.objectContaining({
      confirmedDelayDays: forecast.forecastDelayDays,
      weightedConfirmedDelayDays: expect.any(Number),
      weightedRiskScore: expect.any(Number),
      criticality: expect.objectContaining({
        isCritical: true,
        criticalityWeight: expect.any(Number),
      }),
      responsibilityBreakdown: [
        expect.objectContaining({
          ownerUnitId: 'unit-facade',
          ownerRole: 'supplier_install',
        }),
      ],
    }))
    expect(signalSummary.weightedConfirmedDelayDays).toBeGreaterThanOrEqual(signalSummary.confirmedDelayDays)
  })

  it('uses linked acceptance timeline dates as finish gates instead of synthetic default lag days', async () => {
    state.tasks = [{
      id: 'task-acceptance-gate',
      project_id: 'project-1',
      title: 'Completion acceptance projection',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-18',
      progress: 90,
    }]
    state.snapshots = [
      { task_id: 'task-acceptance-gate', progress: 80, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-acceptance-gate', progress: 90, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]
    state.acceptancePlans = [{
      id: 'acceptance-finish',
      project_id: 'project-1',
      status: 'submitted',
      planned_date: '2026-05-25',
      actual_date: null,
    }]
    state.projectEntityLinks = [{
      project_id: 'project-1',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'acceptance-finish',
      target_entity_type: 'task',
      target_entity_id: 'task-acceptance-gate',
      relation_type: 'covers_task',
      status: 'active',
    }]

    const forecast = await forecastTaskDuration('task-acceptance-gate')

    expect(forecast.forecastSources?.externalReadinessImpactDays).toBe(0)
    expect((forecast.forecastSources?.externalReadiness as any)?.impactModeBreakdown).toMatchObject({
      finish_lag: null,
      signal_modes: expect.objectContaining({ finish_gate: 1 }),
    })
    expect((forecast.forecastSources as any)?.acceptanceFinishWaitDays).toBeGreaterThan(0)
    expect(String(forecast.forecastFinishDate) >= '2026-05-25').toBe(true)
  })

  it('uses configured forecast model weights instead of hardcoded candidate weights', async () => {
    state.modelProfiles = [{
      id: 'profile-1',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'test_profile_v1',
        candidateWeights: {
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-profile',
      project_id: 'project-1',
      title: 'Profile driven task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 20,
    }]
    state.snapshots = [
      { task_id: 'task-profile', progress: 0, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-profile', progress: 10, snapshot_date: '2026-05-18', created_at: '2026-05-18T12:00:00.000Z' },
      { task_id: 'task-profile', progress: 20, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-profile')

    expect(forecast.remainingDurationDays).toBe(8)
    expect(forecast.forecastSources?.modelProfile).toMatchObject({
      key: 'remaining_duration_forecast',
      version: 'test_profile_v1',
      source: 'table',
    })
    expect(forecast.forecastSources?.weights).toEqual([
      expect.objectContaining({ key: 'reference_ratio', weight: 1 }),
    ])
    expect(state.insertedForecasts[0]?.weight_profile).toMatchObject({
      source: 'table',
    })
  })

  it('ignores zero-weight forecast candidates when calculating candidate spread confidence impact', async () => {
    state.modelProfiles = [{
      id: 'profile-zero-spread',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'zero_spread_profile_v1',
        candidateWeights: {
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-zero-spread',
      project_id: 'project-1',
      title: 'Zero spread task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      actual_start_date: '2026-05-01',
      progress: 80,
    }]
    state.snapshots = [
      { task_id: 'task-zero-spread', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-zero-spread', progress: 40, snapshot_date: '2026-05-10', created_at: '2026-05-10T08:00:00.000Z' },
      { task_id: 'task-zero-spread', progress: 80, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-zero-spread')

    expect(forecast.forecastSources?.weights).toEqual([
      expect.objectContaining({ key: 'reference_ratio', weight: 1 }),
    ])
    expect(forecast.forecastSources?.candidateSpread).toMatchObject({
      ratio: null,
      confidenceDelta: 0,
    })
  })

  it('updates the current forecast instead of inserting history for daily refresh context', async () => {
    state.tasks = [{
      id: 'task-daily-refresh',
      project_id: 'project-1',
      title: 'Daily refreshed task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 30,
    }]
    state.dependencyForecasts = [{
      id: 'forecast-current',
      task_id: 'task-daily-refresh',
      project_id: 'project-1',
      forecast_finish_date: '2026-05-25',
      remaining_duration_days: 5,
      is_current: true,
      metadata: {},
    }]

    const forecast = await forecastTaskDuration('task-daily-refresh', { triggerContext: 'daily_dashboard_refresh' })

    expect(forecast.forecastSources?.forecastOptions).toMatchObject({
      triggerContext: 'daily_dashboard_refresh',
      writePolicy: 'update_current',
    })
    expect(state.insertedForecasts).toHaveLength(0)
    expect(state.updatedForecasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'task_duration_forecasts',
        payload: expect.objectContaining({
          remaining_duration_days: forecast.remainingDurationDays,
          is_current: true,
          generated_at: '2026-05-18T08:00:00.000Z',
        }),
      }),
    ]))
  })

  it('refreshes daily active task duration forecasts in batches and reports freshness SLO', async () => {
    state.tasks = [
      {
        id: 'task-daily-1',
        project_id: 'project-1',
        title: 'Daily active task 1',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-26',
        actual_start_date: '2026-05-18',
        progress: 20,
        status: 'in_progress',
        updated_at: '2026-05-18T07:00:00.000Z',
      },
      {
        id: 'task-daily-2',
        project_id: 'project-1',
        title: 'Daily active task 2',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-28',
        actual_start_date: '2026-05-18',
        progress: 10,
        status: 'todo',
        updated_at: '2026-05-18T06:00:00.000Z',
      },
      {
        id: 'task-daily-3',
        project_id: 'project-1',
        title: 'Daily active task 3',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-29',
        actual_start_date: '2026-05-18',
        progress: 30,
        status: 'blocked',
        updated_at: '2026-05-18T05:00:00.000Z',
      },
      {
        id: 'task-completed-not-refreshed',
        project_id: 'project-1',
        title: 'Completed task',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-10',
        progress: 100,
        status: 'completed',
        updated_at: '2026-05-18T04:00:00.000Z',
      },
    ]
    state.dependencyForecasts = [
      {
        id: 'forecast-daily-1',
        task_id: 'task-daily-1',
        project_id: 'project-1',
        remaining_duration_days: 8,
        forecast_finish_date: '2026-05-26',
        is_current: true,
        generated_at: '2026-05-15T08:00:00.000Z',
        metadata: {},
      },
      {
        id: 'forecast-daily-2',
        task_id: 'task-daily-2',
        project_id: 'project-1',
        remaining_duration_days: 7,
        forecast_finish_date: '2026-05-25',
        is_current: true,
        generated_at: '2026-05-18T07:30:00.000Z',
        metadata: {},
      },
    ]

    const result = await refreshDailyActiveTaskDurationForecasts({
      limit: 10,
      batchSize: 2,
      maxRuntimeMs: 10_000,
      freshnessSloMs: 36 * 60 * 60 * 1000,
    })

    expect(result).toMatchObject({
      scanned: 3,
      refreshed: 3,
      failed: 0,
      skippedByTimeBudget: 0,
      batchSize: 2,
      maxRuntimeMs: 10_000,
      batchesAttempted: 2,
      staleCurrentForecastsBefore: 2,
      staleCurrentForecastsAfter: 0,
      freshCurrentForecastsAfter: 3,
      freshnessSloMet: true,
      timeBudgetExceeded: false,
    })
    expect(state.insertedForecasts).toHaveLength(1)
    expect(state.dependencyForecasts.find((forecast) => forecast.task_id === 'task-daily-3')).toEqual(
      expect.objectContaining({
        is_current: true,
        generated_at: '2026-05-18T08:00:00.000Z',
      }),
    )
    expect(state.updatedForecasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'task_duration_forecasts',
        payload: expect.objectContaining({
          generated_at: '2026-05-18T08:00:00.000Z',
          is_current: true,
        }),
      }),
    ]))
  })

  it('stops daily refresh when the runtime budget is exhausted before the first batch', async () => {
    state.tasks = [
      {
        id: 'task-budget-1',
        project_id: 'project-1',
        title: 'Budget guarded task 1',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-26',
        actual_start_date: '2026-05-18',
        progress: 20,
        status: 'in_progress',
        updated_at: '2026-05-18T07:00:00.000Z',
      },
      {
        id: 'task-budget-2',
        project_id: 'project-1',
        title: 'Budget guarded task 2',
        planned_start_date: '2026-05-18',
        planned_end_date: '2026-05-28',
        actual_start_date: '2026-05-18',
        progress: 40,
        status: 'pending',
        updated_at: '2026-05-18T06:00:00.000Z',
      },
    ]

    const result = await refreshDailyActiveTaskDurationForecasts({
      limit: 10,
      batchSize: 1,
      maxRuntimeMs: 0,
      freshnessSloMs: 36 * 60 * 60 * 1000,
    })

    expect(result).toMatchObject({
      scanned: 2,
      refreshed: 0,
      failed: 0,
      skippedByTimeBudget: 2,
      batchSize: 1,
      maxRuntimeMs: 0,
      batchesAttempted: 0,
      staleCurrentForecastsBefore: 2,
      staleCurrentForecastsAfter: 2,
      freshCurrentForecastsAfter: 0,
      freshnessSloMet: false,
      timeBudgetExceeded: true,
    })
    expect(state.insertedForecasts).toHaveLength(0)
    expect(state.updatedForecasts).toHaveLength(0)
  })

  it('reads execution_reference_days before legacy recommended_duration_days from current forecast cache', async () => {
    state.dependencyForecasts = [{
      id: 'forecast-current-reference',
      task_id: 'task-cached-reference',
      project_id: 'project-1',
      recommended_duration_days: 99,
      execution_reference_days: 14,
      conservative_duration_days: 20,
      remaining_duration_days: 7,
      forecast_finish_date: '2026-05-25',
      forecast_delay_days: 0,
      confidence_level: 'medium',
      confidence_score: 66,
      forecast_source: 'cached_current',
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
      metadata: {},
    }]

    const forecast = await forecastTaskDuration('task-cached-reference', { useCache: true })

    expect(forecast.executionReferenceDays).toBe(14)
    expect(forecast.recommendedDurationDays).toBe(14)
    expect(state.insertedForecasts).toHaveLength(0)
    expect(state.updatedForecasts).toHaveLength(0)
  })

  it('maps PostgreSQL DATE objects from current forecasts without losing the calendar date', async () => {
    state.dependencyForecasts = [{
      id: 'forecast-current-date-object',
      task_id: 'task-date-object',
      project_id: 'project-1',
      recommended_duration_days: 8,
      execution_reference_days: 8,
      conservative_duration_days: 12,
      remaining_duration_days: 8,
      forecast_finish_date: new Date(2026, 3, 20),
      forecast_delay_days: 0,
      confidence_level: 'high',
      confidence_score: 90,
      forecast_source: 'cached_current',
      is_current: true,
      created_at: '2026-05-18T08:00:00.000Z',
      metadata: {},
    }]

    const [forecast] = await listCurrentTaskDurationForecasts(['task-date-object'], {
      projectId: 'project-1',
      maxAgeMs: null,
    })

    expect(forecast?.forecastFinishDate).toBe('2026-04-20')
  })

  it('applies duration context factors to remaining forecast and lowers forecast confidence', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      factorSummary: {
        businessReasons: ['Crew window overlaps with another work face.'],
        confidenceDelta: -12,
        factors: [{
          key: 'resource_conflict',
          label: '现场承载压力',
          multiplier: 1.1,
          extraDays: 3,
          confidenceDelta: -12,
          actionPolicy: 'candidate_only',
          reason: 'Crew window overlaps with another work face.',
        }],
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['resource_conflict'],
          confidence_level: 'low',
          factor_summary_available: true,
        },
      },
    })
    state.tasks = [{
      id: 'task-context',
      project_id: 'project-1',
      title: 'Context sensitive task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]
    state.snapshots = [
      { task_id: 'task-context', progress: 10, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
      { task_id: 'task-context', progress: 30, snapshot_date: '2026-05-18', created_at: '2026-05-18T12:00:00.000Z' },
      { task_id: 'task-context', progress: 50, snapshot_date: '2026-05-18', created_at: '2026-05-18T16:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-context')

    expect(forecast.forecastSources?.contextImpactDays).toBeGreaterThanOrEqual(3)
    expect((forecast.forecastSources?.impactModeBreakdown as any)?.context).toEqual(expect.objectContaining({
      add_days: 3,
      multiplier: 1,
    }))
    expect(forecast.topFactors).toEqual(expect.arrayContaining([
      '现场上下文因素增加 3 天执行缓冲。',
      'Crew window overlaps with another work face.',
    ]))
    expect(forecast.confidenceScore).toBeLessThan(62)
  })

  it('applies planning replay calibration readback to E2 remaining forecasts as candidate-only correction', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 10,
      conservativeDurationDays: 14,
      confidenceScore: 70,
    })
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValueOnce({
      status: 'ready',
      coarseProcessKey: 'generic_task',
      evidenceRefs: ['planning_replay_calibration_events:event-e2'],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 22,
      originalMae: 6,
      replayMae: 3,
      maeImprovement: 3,
      overcompensationRate: 0.1,
      e1DurationAdjustmentDays: null,
      e2ResidualCorrectionDays: 4,
      capacityBudgetFactor: null,
      priorityWeightAdjustment: null,
      e2TargetDiscountFactor: null,
      rejectedEvidence: [],
    })
    state.tasks = [{
      id: 'task-e2-replay',
      project_id: 'project-1',
      title: 'Generic task',
      standard_work_code: 'generic_task',
      standard_work_name: 'Generic task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-30',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-e2-replay')

    expect(mocks.readPlanningReplayCalibrationReadback).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      standardWorkCode: 'generic_task',
      standardWorkName: 'Generic task',
    }))
    expect(forecast.remainingDurationDays).toBe(10)
    expect(forecast.forecastSources?.planningReplayCalibrationReadback).toMatchObject({
      applied: true,
      e2ResidualCorrectionDays: 4,
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 22,
      evidenceRefs: ['planning_replay_calibration_events:event-e2'],
    })
    expect((forecast.calculationContext as any)?.remaining_duration_forecast).toEqual(expect.objectContaining({
      planningReplayCalibrationReadback: expect.objectContaining({
        applied: true,
        e2ResidualCorrectionDays: 4,
      }),
    }))
    expect(state.insertedForecasts[0]?.metadata).toEqual(expect.objectContaining({
      planningReplayCalibrationReadback: expect.objectContaining({
        applied: true,
        e2ResidualCorrectionDays: 4,
      }),
    }))
  })

  it('surfaces T2 rhythm assembly context in E2 remaining forecasts without applying template days or writing dependencies', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 12,
      conservativeDurationDays: 18,
      confidenceScore: 72,
      factorSummary: {
        businessReasons: ['T2 rhythm candidate package is visible through L3 assembly.'],
        calculationContext: {
          durationInputAssembly: {
            source: 'duration_input_assembler',
            assemblyGate: {
              status: 'compatible_candidate',
              canEnterC1913Phase1Selection: true,
              requiresManualReview: false,
              canWriteTaskDependencies: false,
              canWritePlanDates: false,
              priorityOverrideBlocked: false,
              conflictCodes: [],
            },
            inputChannels: {
              t2RhythmScheduleCandidatePackage: {
                source: 'project_metadata',
                status: 'ready',
                tier: 'T2',
                selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
              },
              t2RhythmScheduleCandidateNetworkEvaluation: {
                source: 'project_metadata',
                status: 'ready',
                tier: 'T2',
                candidateId: 't2-network-residential-standard-floor',
              },
            },
            mutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
              writesSeed: false,
              writesBaseline: false,
              writesRuntimePublications: false,
            },
          },
          t2RhythmScheduleCandidatePackage: {
            source: 't2_division_rhythm_schedule_candidate_package',
            tier: 'T2',
            status: 'schedulable_candidate',
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationContextCandidateCount: 6,
            dependencyCandidateCount: 5,
            hardGateCount: 3,
            scheduleTrustPolicy: {
              autoApply: false,
              writesTaskDependencies: false,
              writesPlanDates: false,
              requiresAssemblyCompatibility: true,
              requiresL5Publication: true,
            },
          },
          t2RhythmScheduleCandidateNetworkEvaluation: {
            source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
            status: 'phase1_readonly_evaluation_ready',
            candidateId: 't2-network-residential-standard-floor',
            canEnterC1913Phase1Selection: true,
            networkSpanDays: 7,
            criticalWindowCodes: ['floor_rebar_formwork_mep_embed', 'concrete_pour_curing'],
            mutationBoundary: {
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            },
          },
        },
      },
      calculationContext: {
        durationInputAssembly: {
          source: 'duration_input_assembler',
          assemblyGate: {
            status: 'compatible_candidate',
            canEnterC1913Phase1Selection: true,
            requiresManualReview: false,
            canWriteTaskDependencies: false,
            canWritePlanDates: false,
            priorityOverrideBlocked: false,
            conflictCodes: [],
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
            writesRuntimePublications: false,
          },
        },
        t2RhythmScheduleCandidatePackage: {
          source: 't2_division_rhythm_schedule_candidate_package',
          tier: 'T2',
          status: 'schedulable_candidate',
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          durationContextCandidateCount: 6,
          dependencyCandidateCount: 5,
          hardGateCount: 3,
          scheduleTrustPolicy: {
            autoApply: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            requiresAssemblyCompatibility: true,
            requiresL5Publication: true,
          },
        },
        t2RhythmScheduleCandidateNetworkEvaluation: {
          source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
          status: 'phase1_readonly_evaluation_ready',
          candidateId: 't2-network-residential-standard-floor',
          canEnterC1913Phase1Selection: true,
          networkSpanDays: 7,
          criticalWindowCodes: ['floor_rebar_formwork_mep_embed', 'concrete_pour_curing'],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          },
        },
      },
    })
    state.tasks = [{
      id: 'task-e2-t2-rhythm',
      project_id: 'project-1',
      title: '标准层结构节奏跟踪',
      standard_work_code: 'residential.standard_floor.structure',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-31',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-e2-t2-rhythm')

    expect(forecast.remainingDurationDays).toBe(6)
    expect(forecast.executionReferenceDays).toBe(12)
    expect(forecast.forecastSources?.t2RhythmScheduleCandidatePackage).toEqual(expect.objectContaining({
      source: 't2_division_rhythm_schedule_candidate_package',
      tier: 'T2',
      status: 'schedulable_candidate',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      durationContextCandidateCount: 6,
      dependencyCandidateCount: 5,
    }))
    expect(forecast.forecastSources?.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
      assemblyGate: expect.objectContaining({
        status: 'compatible_candidate',
        canEnterC1913Phase1Selection: true,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect((forecast.calculationContext as any)?.remaining_duration_forecast).toEqual(expect.objectContaining({
      t2RhythmScheduleCandidatePackage: expect.objectContaining({
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      }),
      durationInputAssembly: expect.objectContaining({
        source: 'duration_input_assembler',
      }),
    }))
    expect(state.insertedForecasts[0]).toEqual(expect.objectContaining({
      remaining_duration_days: 6,
      execution_reference_days: 12,
    }))
    expect(state.insertedForecasts[0]).not.toHaveProperty('recommended_duration_days')
    expect(state.insertedForecasts[0]?.metadata).toEqual(expect.objectContaining({
      t2RhythmScheduleCandidatePackage: expect.objectContaining({
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      }),
      durationInputAssembly: expect.objectContaining({
        source: 'duration_input_assembler',
      }),
    }))
    expect(state.dependencies).toHaveLength(0)
  })

  it('assembles E2 actual execution facts into remaining forecast evidence even without upstream E1 assembly', async () => {
    state.tasks = [{
      id: 'task-e2-own-assembly',
      project_id: 'project-1',
      title: 'E2 assembly task',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-24',
      actual_start_date: '2026-05-12',
      progress: 40,
    }]
    state.snapshots = [{
      task_id: 'task-e2-own-assembly',
      progress: 25,
      snapshot_date: '2026-05-15',
      created_at: '2026-05-15T12:00:00.000Z',
    }]

    const forecast = await forecastTaskDuration('task-e2-own-assembly')

    expect(forecast.forecastSources?.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
      inputChannels: expect.objectContaining({
        actualExecutionFacts: expect.objectContaining({
          source: 'explicit_input',
          status: 'ready',
          assetSource: 'runtime_execution_facts',
        }),
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect((forecast.calculationContext as any)?.remaining_duration_forecast?.durationInputAssembly).toEqual(expect.objectContaining({
      source: 'duration_input_assembler',
      inputChannels: expect.objectContaining({
        actualExecutionFacts: expect.objectContaining({
          status: 'ready',
        }),
      }),
    }))
    expect(state.insertedForecasts[0]?.metadata).toEqual(expect.objectContaining({
      durationInputAssembly: expect.objectContaining({
        source: 'duration_input_assembler',
      }),
    }))
    expect(state.dependencies).toHaveLength(0)
  })

  it('uses history_velocity as the sole duration multiplier when context progress velocity is candidate-only', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
      factorSummary: {
        businessReasons: ['Project history velocity is available as a forecast candidate.'],
        confidenceDelta: 4,
        factors: [{
          key: 'progress_velocity',
          label: 'project progress velocity',
          multiplier: 1.2,
          extraDays: 0,
          confidenceDelta: 4,
          actionPolicy: 'candidate_only',
          reason: 'Similar completed tasks multiplier 1.2.',
          source: 'project_history',
        }],
      },
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValueOnce({
      durationRatio: 1.2,
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 84,
      confidenceDelta: 4,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.06,
      groupKey: 'standard_work:generic_task',
      excludedAnomalyTaskCount: 0,
      reason: 'Similar completed tasks multiplier 1.2.',
      metadata: { matchLevel: 'standard_work' },
    })
    state.modelProfiles = [{
      id: 'profile-history-velocity-only',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'history_velocity_contract_v1',
        candidateWeights: {
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 0, history_velocity: 1 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-history-velocity-unique',
      project_id: 'project-1',
      title: 'Generic task',
      standard_work_code: 'generic_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-history-velocity-unique')

    expect(forecast.remainingDurationDays).toBe(12)
    expect(forecast.forecastSources?.executionMultiplier).toBe(1)
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 10 }),
      expect.objectContaining({ key: 'history_velocity', days: 12 }),
    ]))
    expect(forecast.forecastSources?.weights).toEqual([
      expect.objectContaining({ key: 'history_velocity', days: 12, weight: 1 }),
    ])
    expect((forecast.forecastSources?.impactModeBreakdown as any)?.context).toEqual(expect.objectContaining({
      multiplier: 1,
      add_days: 0,
    }))
  })

  it('keeps a structural tail reserve for back-heavy work instead of linearly compressing the last 5 percent', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 32,
      businessReasonParams: {
        benchmarkP50: 20,
        benchmarkP80: 32,
        benchmarkVariance: 0.08,
      },
    })
    state.tasks = [{
      id: 'task-back-heavy-tail',
      project_id: 'project-1',
      title: 'Commissioning task',
      standard_work_code: 'commissioning_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 95,
    }]

    const forecast = await forecastTaskDuration('task-back-heavy-tail')
    const probabilityDuration = (forecast as any).probabilityDuration

    expect(forecast.forecastSources?.curveType).toBe('back_heavy')
    expect(forecast.forecastSources?.curveMultiplier).toBe(1.5)
    expect(forecast.remainingDurationDays).toBe(6)
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 4 }),
    ]))
    expect((forecast.forecastSources?.candidates as Array<{ key: string }>).map((candidate) => candidate.key)).not.toContain('spi_eac')
    expect(probabilityDuration).toEqual(expect.objectContaining({
      p50RemainingDays: 6,
      p80RemainingDays: 11,
    }))
  })

  it('applies progress curve tail shape to history velocity candidates', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValueOnce({
      durationRatio: 1.2,
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 84,
      confidenceDelta: 4,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.06,
      groupKey: 'standard_work:commissioning_task',
      excludedAnomalyTaskCount: 0,
      reason: 'Similar completed commissioning tasks multiplier 1.2.',
      metadata: { matchLevel: 'standard_work' },
    })
    state.modelProfiles = [{
      id: 'profile-history-velocity-back-heavy',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'history_velocity_curve_contract_v1',
        candidateWeights: {
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 0, history_velocity: 1 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-history-velocity-back-heavy',
      project_id: 'project-1',
      title: 'Commissioning task',
      standard_work_code: 'commissioning_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-history-velocity-back-heavy')

    expect(forecast.forecastSources?.curveType).toBe('back_heavy')
    expect(forecast.forecastSources?.curveMultiplier).toBe(1.25)
    expect(forecast.forecastSources?.weightedBaseRemainingDays).toBe(16)
    expect(forecast.remainingDurationDays).toBe(20)
  })

  it('keeps history velocity on the curve-aware tail instead of the linear tail', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValueOnce({
      durationRatio: 1.2,
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 84,
      confidenceDelta: 4,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.06,
      groupKey: 'standard_work:commissioning_task',
      excludedAnomalyTaskCount: 0,
      reason: 'Similar completed commissioning tasks multiplier 1.2.',
      metadata: { matchLevel: 'standard_work' },
    })
    state.modelProfiles = [{
      id: 'profile-history-velocity-back-heavy-tail',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'history_velocity_curve_tail_contract_v1',
        candidateWeights: {
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 0, history_velocity: 1 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-history-velocity-back-heavy-tail',
      project_id: 'project-1',
      title: 'Commissioning task',
      standard_work_code: 'commissioning_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 95,
    }]

    const forecast = await forecastTaskDuration('task-history-velocity-back-heavy-tail')

    expect(forecast.forecastSources?.curveType).toBe('back_heavy')
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 4 }),
      expect.objectContaining({ key: 'history_velocity', days: 5 }),
    ]))
    expect(forecast.forecastSources?.weights).toEqual([
      expect.objectContaining({ key: 'history_velocity', days: 5, weight: 1 }),
    ])
    expect(forecast.remainingDurationDays).toBe(8)
  })

  it('uses the non-linear S-curve body for reference and history velocity candidates', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    mocks.loadPublishedProgressVelocityRuntime.mockResolvedValueOnce({
      durationRatio: 1.2,
      multiplier: 1.2,
      confidenceLevel: 'high',
      confidenceScore: 84,
      confidenceDelta: 4,
      actionPolicy: 'auto_apply',
      sampleCount: 8,
      variance: 0.06,
      groupKey: 'standard_work:mep_installation_task',
      excludedAnomalyTaskCount: 0,
      reason: 'Similar completed installation tasks multiplier 1.2.',
      metadata: { matchLevel: 'standard_work' },
    })
    state.modelProfiles = [{
      id: 'profile-history-velocity-s-curve-body',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'history_velocity_s_curve_body_contract_v1',
        candidateWeights: {
          L2: { reference_ratio: 0, spi_eac: 0, recent_velocity: 0, history_velocity: 1 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-history-velocity-s-curve-body',
      project_id: 'project-1',
      title: 'MEP installation task',
      standard_work_code: 'mep_installation_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 70,
    }]

    const forecast = await forecastTaskDuration('task-history-velocity-s-curve-body')

    expect(forecast.forecastSources?.curveType).toBe('s_curve')
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 8 }),
      expect.objectContaining({ key: 'history_velocity', days: 10 }),
    ]))
    expect(forecast.forecastSources?.weightedBaseRemainingDays).toBe(10)
    expect(forecast.remainingDurationDays).toBe(10)
  })

  it('keeps a structural tail reserve for back-heavy work before the finishing plateau', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    state.modelProfiles = [{
      id: 'profile-back-heavy-mid-tail-reserve',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'back_heavy_mid_tail_reserve_contract_v1',
        candidateWeights: {
          L1: { reference_ratio: 0, spi_eac: 0, recent_velocity: 1, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-back-heavy-mid-tail-reserve',
      project_id: 'project-1',
      title: 'Commissioning task',
      standard_work_code: 'commissioning_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]
    state.snapshots = [
      { task_id: 'task-back-heavy-mid-tail-reserve', progress: 10, snapshot_date: '2026-05-16', created_at: '2026-05-16T08:00:00.000Z' },
      { task_id: 'task-back-heavy-mid-tail-reserve', progress: 30, snapshot_date: '2026-05-17', created_at: '2026-05-17T08:00:00.000Z' },
      { task_id: 'task-back-heavy-mid-tail-reserve', progress: 50, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-back-heavy-mid-tail-reserve')
    const candidateKeys = (forecast.forecastSources?.candidates as Array<{ key: string }>).map((candidate) => candidate.key)

    expect(forecast.forecastSources?.curveType).toBe('back_heavy')
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 13 }),
    ]))
    expect(candidateKeys).not.toContain('recent_velocity')
    expect(forecast.forecastSources?.weightedBaseRemainingDays).toBe(13)
    expect(forecast.remainingDurationDays).toBe(17)
  })

  it('adds a structural tail reserve to back-heavy work before any stuck signal appears', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 28,
    })
    state.modelProfiles = [{
      id: 'profile-back-heavy-structural-tail',
      model_key: 'remaining_duration_forecast',
      model_status: 'active',
      confidence_weight: 1,
      metadata: {
        modelVersion: 'back_heavy_structural_tail_contract_v1',
        candidateWeights: {
          L1: { reference_ratio: 1, spi_eac: 0, recent_velocity: 0, history_velocity: 0 },
        },
      },
    }]
    state.tasks = [{
      id: 'task-back-heavy-structural-tail',
      project_id: 'project-1',
      title: 'Commissioning task',
      standard_work_code: 'commissioning_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 70,
    }]

    const forecast = await forecastTaskDuration('task-back-heavy-structural-tail')

    expect(forecast.forecastSources?.curveType).toBe('back_heavy')
    expect(forecast.forecastSources?.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'reference_ratio', days: 10 }),
    ]))
    expect(forecast.forecastSources?.weightedBaseRemainingDays).toBe(10)
  })

  it('applies project schedule state acceleration as a short-term remaining-duration correction', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      factorSummary: {
        contextVersion: 'v1.4.7.4',
        multiplier: 0.9,
        extraDays: 0,
        businessReasons: ['Organized local acceleration is active.'],
        confidenceDelta: 2,
        adjustedBy: ['project_schedule_state'],
        factors: [{
          key: 'project_schedule_state',
          label: 'project schedule state',
          multiplier: 0.9,
          extraDays: 0,
          confidenceDelta: 2,
          actionPolicy: 'candidate_only',
          reason: 'Organized local acceleration is active.',
          source: 'project_schedule_state',
          metadata: {
            state: 'accelerating',
            downstreamPolicy: {
              canAdjustRemainingDuration: true,
              velocityFactorSupersedes: true,
              localAccelerationFactor: 0.9,
              maxForwardDays: 14,
            },
          },
        }],
        calculationContext: {
          duration_source: 'standard',
          adjusted_by: ['project_schedule_state'],
          confidence_level: 'medium',
          factor_summary_available: true,
          project_schedule_state: 'accelerating',
          project_schedule_state_factor: 0.9,
        },
      },
    })
    state.tasks = [{
      id: 'task-state-acceleration',
      project_id: 'project-1',
      title: 'Accelerated task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-27',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-state-acceleration')

    expect(forecast.remainingDurationDays).toBe(5)
    expect(forecast.forecastSources).toMatchObject({
      scheduleStateAccelerationMultiplier: 0.9,
    })
    const remainingForecastContext = (forecast.calculationContext as Record<string, any> | null | undefined)?.remaining_duration_forecast
    expect(remainingForecastContext).toEqual(expect.objectContaining({
      scheduleStateAccelerationMultiplier: 0.9,
      contextImpact: expect.objectContaining({
        accelerationMultiplier: 0.9,
        appliedFactors: expect.arrayContaining([
          expect.objectContaining({ key: 'project_schedule_state' }),
        ]),
      }),
    }))
  })

  it('limits to plan reference ratio candidates when progress quality marks execution data unreliable', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      factorSummary: {
        businessReasons: ['Progress quality fallback requested.'],
        confidenceDelta: -25,
        factors: [{
          key: 'progress_quality',
          label: 'progress quality',
          multiplier: 1,
          extraDays: 0,
          confidenceDelta: -25,
          actionPolicy: 'confidence_only',
          reason: 'Progress rollback makes execution candidates unreliable.',
          metadata: {
            planReferenceFallbackRecommended: true,
            planReferenceFallbackPolicy: 'plan_reference_ratio_only',
          },
        }],
      },
    })
    state.tasks = [{
      id: 'task-quality-fallback',
      project_id: 'project-1',
      title: 'Quality fallback task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 20,
    }]
    state.snapshots = [
      { task_id: 'task-quality-fallback', progress: 0, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z' },
      { task_id: 'task-quality-fallback', progress: 10, snapshot_date: '2026-05-08', created_at: '2026-05-08T08:00:00.000Z' },
      { task_id: 'task-quality-fallback', progress: 20, snapshot_date: '2026-05-18', created_at: '2026-05-18T08:00:00.000Z' },
    ]

    const forecast = await forecastTaskDuration('task-quality-fallback')
    const candidateKeys = ((forecast.forecastSources?.candidates ?? []) as Array<{ key: string }>).map((candidate) => candidate.key)

    expect(candidateKeys).toEqual(['reference_ratio'])
    expect(forecast.remainingDurationDays).toBe(8)
    expect(forecast.forecastSources).toMatchObject({
      planReferenceFallbackRecommended: true,
      planReferenceFallbackFactorCount: 1,
    })
    expect(forecast.businessFactorBadges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'progress_quality_plan_reference_fallback', severity: 'high' }),
    ]))
  })

  it('exposes a probability duration window from existing benchmark percentiles without replacing the deterministic remaining forecast', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 32,
      businessReasonParams: {
        companyBenchmarkP20: 16,
        companyBenchmarkP50: 20,
        companyBenchmarkP80: 32,
        companyBenchmarkMean: 22,
        companyBenchmarkVariance: 0.08,
      },
      calculationContext: {
        duration_source: 'standard_work_duration_seed+company_history_sample',
        durationDistribution: {
          p20: 16,
          p50: 20,
          p80: 32,
          mean: 22,
          variance: 0.08,
          source: 'duration_benchmarks',
        },
      },
    })
    state.tasks = [{
      id: 'task-probability-window',
      project_id: 'project-1',
      title: 'Concrete pour with known distribution',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-probability-window')
    const probabilityDuration = (forecast as any).probabilityDuration

    expect(forecast.remainingDurationDays).toBe(15)
    expect(probabilityDuration).toEqual(expect.objectContaining({
      method: 'pert_from_existing_percentiles',
      p20RemainingDays: 8,
      p50RemainingDays: 10,
      p80RemainingDays: 16,
      source: 'duration_benchmarks',
    }))
    expect(probabilityDuration.p80RemainingDays).toBeGreaterThan(forecast.remainingDurationDays ?? 0)
    expect(forecast.forecastSources?.forecastPaths).toMatchObject({
      recommended: { remainingDays: 15 },
      conservative: { remainingDays: expect.any(Number) },
    })
  })

  it('keeps probability duration windows ordered when source percentiles are inverted', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 12,
      businessReasonParams: {
        companyBenchmarkP20: 36,
        companyBenchmarkP50: 20,
        companyBenchmarkP80: 12,
      },
      calculationContext: {
        duration_source: 'standard_work_duration_seed+company_history_sample',
        durationDistribution: {
          p20: 36,
          p50: 20,
          p80: 12,
          source: 'duration_benchmarks',
        },
      },
    })
    state.tasks = [{
      id: 'task-probability-inverted-window',
      project_id: 'project-1',
      title: 'Concrete pour with inverted distribution',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-probability-inverted-window')
    const probabilityDuration = (forecast as any).probabilityDuration

    expect(probabilityDuration.p20RemainingDays).toBeLessThanOrEqual(probabilityDuration.p50RemainingDays)
    expect(probabilityDuration.p50RemainingDays).toBeLessThanOrEqual(probabilityDuration.p80RemainingDays)
    expect((forecast.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'duration.band.order' }),
    ]))
  })

  it('caps implausible remaining forecasts relative to the planned task duration', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 1000,
      conservativeDurationDays: 1200,
    })
    state.tasks = [{
      id: 'task-relative-cap',
      project_id: 'project-1',
      title: 'Short planned task with bad reference duration',
      standard_work_code: 'short_planned_task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-05',
      actual_start_date: '2026-05-01',
      progress: 10,
    }]

    const forecast = await forecastTaskDuration('task-relative-cap')

    expect(forecast.remainingDurationDays).toBe(50)
    expect(forecast.conservativeRemainingDays).toBeGreaterThanOrEqual(50)
    expect((forecast.calculationContext as any).durationPlausibilityWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'duration.max.task_remaining_relative_to_plan',
        severity: 'clamped',
        originalDays: 365,
        adjustedDays: 50,
      }),
    ]))
  })

  it('sharpens the optimistic probability side from benchmark variance when explicit P20 is absent', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      recommendedDurationDays: 20,
      conservativeDurationDays: 32,
      businessReasonParams: {
        benchmarkP50: 20,
        benchmarkP80: 32,
        benchmarkVariance: 0.08,
      },
    })
    state.tasks = [{
      id: 'task-probability-variance',
      project_id: 'project-1',
      title: 'Concrete pour with benchmark variance',
      standard_work_code: 'cast_in_place_concrete',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
      actual_start_date: '2026-05-01',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-probability-variance')
    const probabilityDuration = (forecast as any).probabilityDuration

    expect(probabilityDuration).toEqual(expect.objectContaining({
      p20RemainingDays: 8,
      p50RemainingDays: 10,
      p80RemainingDays: 16,
      variance: 0.08,
    }))
  })

  it('uses capped summary context confidence impact while preserving raw factor contributions', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      ...baseSuggestion(),
      factorSummary: {
        businessReasons: ['Multiple low-confidence execution signals are present.'],
        confidenceDelta: -25,
        rawConfidenceDelta: -63,
        factors: [
          {
            key: 'progress_velocity',
            label: 'progress velocity',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -8,
            actionPolicy: 'confidence_only',
            reason: 'Internal progress velocity is unreliable.',
          },
          {
            key: 'progress_quality',
            label: 'progress quality',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -18,
            actionPolicy: 'confidence_only',
            reason: 'Progress quality anomaly is active.',
          },
          {
            key: 'external_readiness',
            label: 'external readiness',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -25,
            actionPolicy: 'confidence_only',
            reason: 'External readiness evidence is low-confidence.',
          },
          {
            key: 'weather_forecast_impact',
            label: 'weather impact',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -12,
            actionPolicy: 'confidence_only',
            reason: 'Weather signal is confidence-only.',
          },
        ],
      },
    })
    state.tasks = [{
      id: 'task-confidence-clamp',
      project_id: 'project-1',
      title: 'Confidence clamp task',
      planned_start_date: '2026-05-18',
      planned_end_date: '2026-05-29',
      actual_start_date: '2026-05-18',
      progress: 50,
    }]

    const forecast = await forecastTaskDuration('task-confidence-clamp')
    const contextImpact = forecast.forecastSources?.contextImpact as Record<string, any>
    const impactModeBreakdown = forecast.forecastSources?.impactModeBreakdown as Record<string, any>

    expect(impactModeBreakdown.context).toEqual(expect.objectContaining({
      confidence_delta: -25,
    }))
    expect(contextImpact).toEqual(expect.objectContaining({
      confidenceDelta: -25,
      rawConfidenceDelta: -63,
      lowConfidenceFactorCount: 4,
    }))
    expect(contextImpact.appliedFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'external_readiness', confidenceDelta: -25, actionPolicy: 'confidence_only' }),
      expect.objectContaining({ key: 'progress_quality', confidenceDelta: -18, actionPolicy: 'confidence_only' }),
      expect.objectContaining({ key: 'weather_forecast_impact', confidenceDelta: -12, actionPolicy: 'confidence_only' }),
      expect.objectContaining({ key: 'progress_velocity', confidenceDelta: -8, actionPolicy: 'confidence_only' }),
    ]))
    expect((forecast.calculationContext as Record<string, any>).remaining_duration_forecast.contextImpact)
      .toEqual(expect.objectContaining({ confidenceDelta: -25, rawConfidenceDelta: -63 }))
  })

  it('backfills forecast error when a completed task had a current forecast', async () => {
    state.tasks = [{
      id: 'task-complete',
      project_id: 'project-1',
      title: 'Completed task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      actual_end_date: '2026-05-15',
      progress: 100,
    }]
    state.dependencyForecasts = [{
      id: 'forecast-old',
      task_id: 'task-complete',
      project_id: 'project-1',
      forecast_finish_date: '2026-05-10',
      remaining_duration_days: 2,
      is_current: true,
      metadata: {},
    }]

    await forecastTaskDuration('task-complete')

    expect(state.updatedForecasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'task_duration_forecasts',
        payload: expect.objectContaining({
          forecast_error_days: expect.any(Number),
          forecast_error_recorded_at: expect.any(String),
        }),
      }),
    ]))
    expect(state.dependencyForecasts[0]?.forecast_error_days).toBeGreaterThan(0)
  })

  it('treats actual_end_date as completion even when progress synchronization lags', async () => {
    state.tasks = [{
      id: 'task-actual-end-complete',
      project_id: 'project-1',
      title: 'Actual end complete task',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      actual_start_date: '2026-05-01',
      actual_end_date: '2026-05-12',
      status: 'in_progress',
      progress: 99,
    }]

    const forecast = await forecastTaskDuration('task-actual-end-complete')

    expect(forecast.remainingDurationDays).toBe(0)
    expect(forecast.forecastFinishDate).toBe('2026-05-12')
    expect(forecast.forecastSources).toEqual(expect.objectContaining({ completed: true }))
  })
})
