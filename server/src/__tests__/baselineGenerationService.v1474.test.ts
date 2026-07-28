import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  forecastBatchTasks: vi.fn(),
  getTaskDurationSuggestion: vi.fn(),
  readPlanningReplayCalibrationReadback: vi.fn(),
  supabaseFrom: vi.fn(),
  buildProjectCriticalPathSnapshot: vi.fn(),
  getProjectCriticalPathSnapshot: vi.fn(),
}))

vi.mock('../services/taskDurationForecastService.js', () => ({
  forecastBatchTasks: mocks.forecastBatchTasks,
}))

vi.mock('../services/durationSuggestionService.js', () => ({
  getTaskDurationSuggestion: mocks.getTaskDurationSuggestion,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  buildProjectCriticalPathSnapshot: mocks.buildProjectCriticalPathSnapshot,
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
}))

vi.mock('../services/planningReplayCalibrationService.js', () => ({
  readPlanningReplayCalibrationReadback: mocks.readPlanningReplayCalibrationReadback,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../services/realtimeServer.js', () => ({
  broadcastRealtimeEvent: vi.fn(),
}))

import {
  __baselineGenerationV1474TestHooks,
  buildGeneratedBaselineItemsFromTasksV1474,
  buildBaselineGenerationCandidateV1474,
  chooseBaselineGenerationSource,
  prepareBaselineGenerationForProject,
} from '../services/baselineGenerationService.js'
import * as algorithmSeedResolver from '../services/algorithmSeedResolver.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'
import { evaluateBaselineConfirmationGate } from '../services/planningRevisionPoolService.js'

describe('baselineGenerationService v1.4.7.4 seed consumption', () => {
  beforeEach(() => {
    mocks.forecastBatchTasks.mockReset()
    mocks.getTaskDurationSuggestion.mockReset()
    mocks.readPlanningReplayCalibrationReadback.mockReset()
    mocks.readPlanningReplayCalibrationReadback.mockResolvedValue({
      status: 'unavailable',
      coarseProcessKey: null,
      evidenceRefs: [],
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount: 0,
      originalMae: null,
      replayMae: null,
      maeImprovement: null,
      overcompensationRate: null,
      e1DurationAdjustmentDays: null,
      e2ResidualCorrectionDays: null,
      capacityBudgetFactor: null,
      priorityWeightAdjustment: null,
      e2TargetDiscountFactor: null,
      rejectedEvidence: [],
    })
    mocks.supabaseFrom.mockReset()
    mocks.buildProjectCriticalPathSnapshot.mockReset()
    mocks.getProjectCriticalPathSnapshot.mockReset()
    vi.restoreAllMocks()
    algorithmSeedResolver.clearAlgorithmSeedResolverCache()
  })

  function mockSupabaseRows(rowsByTable: Record<string, any[]>) {
    mocks.supabaseFrom.mockImplementation((table: string) => {
      const state = {
        rows: rowsByTable[table] ?? [],
        filters: [] as Array<{ column: string; value: unknown; kind: 'eq' | 'in' }>,
        limitCount: null as number | null,
      }
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.filters.push({ column, value, kind: 'eq' })
          return builder
        },
        in: (column: string, value: unknown[]) => {
          state.filters.push({ column, value, kind: 'in' })
          return builder
        },
        order: () => builder,
        limit: (count: number) => {
          state.limitCount = count
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: resolveRows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject),
      }

      function resolveRows() {
        let rows = state.rows.filter((row) => state.filters.every((filter) => (
          filter.kind === 'in'
            ? Array.isArray(filter.value) && filter.value.includes(row[filter.column])
            : row[filter.column] === filter.value
        )))
        if (state.limitCount != null) rows = rows.slice(0, state.limitCount)
        return rows
      }

      return builder
    })
  }

  it('uses the latest effective baseline as the only generation source', () => {
    const source = chooseBaselineGenerationSource([
      { id: 'draft-newer', status: 'draft', version: null, updated_at: '2026-05-17T00:00:00.000Z' } as any,
      { id: 'confirmed-v1', status: 'confirmed', version: 1, confirmed_at: '2026-05-01T00:00:00.000Z' } as any,
      { id: 'confirmed-v3', status: 'confirmed', version: 3, confirmed_at: '2026-05-10T00:00:00.000Z' } as any,
      { id: 'pending-v2', status: 'pending_realign', version: 2, updated_at: '2026-05-12T00:00:00.000Z' } as any,
    ])

    expect(source?.id).toBe('confirmed-v3')
    expect(chooseBaselineGenerationSource([{ id: 'draft-only', status: 'draft', version: null } as any])).toBeNull()
  })

  it('anchors completed baseline draft rows to actual execution dates with fact provenance', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-completed',
        project_id: 'project-1',
        title: 'Completed concrete pour',
        status: 'completed',
        progress: 100,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-02',
        actual_end_date: '2026-05-06',
      } as any,
    ], [], new Set())

    expect(item.planned_start_date).toBe('2026-05-02')
    expect(item.planned_end_date).toBe('2026-05-06')
    expect(item.source_reason).toContain('actual execution')
    expect(item.snapshot_source).toBe('current_execution_fact')
    expect(item.seed_versions?.[0]).toEqual(expect.objectContaining({
      algorithm: 'baseline_generation',
      version: 'v1.4.7.4',
      dateSource: 'actual_execution',
      frozenCommitment: false,
      requiresUserReview: true,
    }))
  })

  it('extends in-progress baseline draft end dates from E2 forecast finish dates', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e2',
        project_id: 'project-1',
        title: 'In progress masonry',
        status: 'in_progress',
        progress: 45,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-03',
      } as any,
    ], [], new Set(), {
      forecastByTaskId: new Map([
        ['task-e2', {
          forecast_finish_date: '2026-05-18',
          remaining_duration_days: 12,
          confidence_level: 'medium',
        }],
      ]),
    } as any)

    expect(item.planned_start_date).toBe('2026-05-03')
    expect(item.planned_end_date).toBe('2026-05-18')
    expect(item.source_reason).toContain('E2 forecast')
    expect(item.seed_versions?.[0]).toEqual(expect.objectContaining({
      dateSource: 'task_duration_forecast_e2',
    }))
  })

  it('applies bounded planning replay readback to baseline draft duration metadata without mutating facts', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-replay-e2',
        project_id: 'project-1',
        title: 'In progress masonry replay calibrated',
        status: 'in_progress',
        progress: 45,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-03',
        standard_work_code: 'STD-STRUCT-001',
      } as any,
    ], [], new Set(), {
      forecastByTaskId: new Map([
        ['task-replay-e2', {
          forecast_finish_date: '2026-05-18',
          remaining_duration_days: 12,
          confidence_level: 'medium',
        }],
      ]),
      planningReplayReadbackByTaskId: new Map([
        ['task-replay-e2', {
          status: 'ready',
          coarseProcessKey: 'standard_work:STD-STRUCT-001',
          evidenceRefs: ['algorithm_asset_candidate_events:candidate-ok'],
          writePolicy: 'candidate_overlay_only_no_fact_mutation',
          acceptedSampleCount: 8,
          originalMae: 4,
          replayMae: 2,
          maeImprovement: 2,
          overcompensationRate: 0.1,
          e1DurationAdjustmentDays: null,
          e2ResidualCorrectionDays: 2,
          capacityBudgetFactor: null,
          priorityWeightAdjustment: null,
          e2TargetDiscountFactor: null,
          rejectedEvidence: [],
        }],
      ]),
    } as any)

    expect(item.planned_start_date).toBe('2026-05-03')
    expect(item.planned_end_date).toBe('2026-05-20')
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      planning_replay_calibration_status: 'ready',
      planning_replay_calibration_write_policy: 'candidate_overlay_only_no_fact_mutation',
      planning_replay_calibration_adjustment_days: 2,
      planning_replay_calibration_evidence_refs: ['algorithm_asset_candidate_events:candidate-ok'],
      applied_factors: expect.arrayContaining([
        expect.objectContaining({
          factor: 'planning_replay_calibration_readback',
          source: 'planningReplayCalibrationService',
          adjustment_days: 2,
        }),
      ]),
    }))
  })

  it('writes v1474 resource and process constraints into generated baseline items for confirmation gates', async () => {
    const taskRows = [
      {
        id: 'tower-task-1',
        project_id: 'project-1',
        title: 'Tower crane concrete hoist A',
        standard_work_code: '02-01-03-P04',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-01',
        building_object_id: 'building-A',
        floor_object_id: 'floor-1',
        status: 'todo',
        is_executable: true,
        is_wbs_summary: false,
      },
      {
        id: 'tower-task-2',
        project_id: 'project-1',
        title: 'Tower crane concrete hoist B',
        standard_work_code: '02-01-03-P04',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-01',
        building_object_id: 'building-A',
        floor_object_id: 'floor-1',
        status: 'todo',
        is_executable: true,
        is_wbs_summary: false,
      },
    ] as any

    const generated = buildGeneratedBaselineItemsFromTasksV1474(taskRows, [], new Set())
    const enriched = await __baselineGenerationV1474TestHooks.enrichBaselineItemsWithConfirmationGateMetadata({
      projectId: 'project-1',
      taskRows,
      items: generated,
      resolveResourceClass: async () => ({
        __stableCode: 'tower_crane',
        __resolverSource: 'ts_seed_fallback',
        resourceClass: 'tower_crane',
        sameBuildingDailyLimit: 1,
        sameFloorDailyLimit: 1,
        sameZoneDailyLimit: 1,
      }),
      resolveProcessConstraint: async () => ({
        __stableCode: 'concrete_curing_normal_minimum',
        __resolverSource: 'ts_seed_fallback',
        stableCode: 'concrete_curing_normal_minimum',
        overlapAllowed: false,
      }),
    })
    expect(enriched[0].generation_metadata).toEqual(expect.objectContaining({
      resource_class: 'tower_crane',
      resource_limits: expect.objectContaining({
        sameBuildingDailyLimit: 1,
        sameFloorDailyLimit: 1,
        sameZoneDailyLimit: 1,
      }),
      scope_keys: expect.objectContaining({
        building: 'building-A',
        floor: 'floor-1',
      }),
      rcpsp_capacity_pool_key: 'rcpsp|resource:tower_crane|building:building-A|floor:floor-1|zone:global|workface:global',
      rcpsp_capacity_pool_key_source: 'projectCriticalPathService.resource_constraint_scope',
      rcpsp_capacity_pool_key_policy: 'resource_class_scope_key_reused_by_monthly_capacity',
      process_constraint: expect.objectContaining({
        stableCode: 'concrete_curing_normal_minimum',
        source: 'v1474ProcessConstraintSeed',
        overlapAllowed: false,
        scope_key: 'building-A|floor-1',
      }),
      applied_factors: expect.arrayContaining([
        expect.objectContaining({ factor: 'v1474_resource_class_confirmation_gate' }),
        expect.objectContaining({ factor: 'v1474_process_constraint_confirmation_gate' }),
      ]),
    }))

    const gate = evaluateBaselineConfirmationGate({ baselineItems: enriched as any })
    expect(gate.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'resource_peak_over_limit',
      'mutually_exclusive_process_overlap',
    ]))
  })

  it('enriches project-level generated baseline drafts with confirmation gate metadata before E3 rescheduling', async () => {
    mockSupabaseRows({
      task_baselines: [],
      task_baseline_items: [],
      tasks: [
        {
          id: 'prepare-task-1',
          project_id: 'project-1',
          title: 'Tower crane concrete hoist A',
          standard_work_code: '02-01-03-P04',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-A',
          floor_object_id: 'floor-1',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
          sort_order: 1,
        },
        {
          id: 'prepare-task-2',
          project_id: 'project-1',
          title: 'Tower crane concrete hoist B',
          standard_work_code: '02-01-03-P04',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-A',
          floor_object_id: 'floor-1',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
          sort_order: 2,
        },
      ],
      duration_forecasts: [],
      duration_suggestions: [],
    })
    vi.spyOn(algorithmSeedResolver, 'resolveV1474ResourceClass').mockResolvedValue({
      resourceClass: 'tower_crane',
      sameBuildingDailyLimit: 1,
      sameFloorDailyLimit: 1,
      sameZoneDailyLimit: 1,
    } as any)
    vi.spyOn(algorithmSeedResolver, 'resolveV1474ProcessConstraint').mockResolvedValue({
      stableCode: 'concrete_curing_normal_minimum',
      overlapAllowed: false,
    } as any)
    mocks.buildProjectCriticalPathSnapshot.mockImplementation(async (_projectId, taskRows) => ({
      projectId: 'project-1',
      autoTaskIds: taskRows.map((task: any) => task.id),
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: taskRows.map((task: any) => task.id),
      watchedTaskIds: [],
      edges: [],
      tasks: taskRows.map((task: any, index: number) => ({
        taskId: task.id,
        title: task.title,
        floatDays: 0,
        durationDays: 1,
        earliestStartOffsetDays: 0,
        earliestFinishOffsetDays: 1,
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
      })),
      networkSchedule: taskRows.map((task: any) => ({
        taskId: task.id,
        earliestStartOffsetDays: 0,
        earliestFinishOffsetDays: 1,
        floatDays: 0,
      })),
      projectDurationDays: 2,
      calculationStatus: 'fresh',
      networkLineage: { criticalPathInputHash: 'hash-prepare' },
    }))
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      displayTaskIds: ['prepare-task-1', 'prepare-task-2'],
      autoTaskIds: ['prepare-task-1', 'prepare-task-2'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      watchedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      edges: [],
      tasks: [],
      projectDurationDays: 2,
      calculationStatus: 'fresh',
    })

    const preparation = await prepareBaselineGenerationForProject({ projectId: 'project-1' })

    expect(preparation.generatedItems[0].generation_metadata).toEqual(expect.objectContaining({
      resource_class: 'tower_crane',
      process_constraint: expect.objectContaining({
        stableCode: 'concrete_curing_normal_minimum',
        source: 'v1474ProcessConstraintSeed',
        overlapAllowed: false,
      }),
    }))
    expect(evaluateBaselineConfirmationGate({ baselineItems: preparation.generatedItems as any }).blockers.map((blocker) => blocker.code))
      .toEqual(expect.arrayContaining(['resource_peak_over_limit', 'mutually_exclusive_process_overlap']))
  })

  it('fills missing draft dates from E1 duration suggestions instead of dropping the suggestion', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1',
        project_id: 'project-1',
        title: 'Missing end date waterproofing',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1', {
          contextualReferenceDays: 6,
          durationOutputCode: 'contextual_reference',
          confidenceLevel: 'medium',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
        }],
      ]),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    } as any)

    expect(item.planned_start_date).toBe('2026-06-01')
    expect(item.planned_end_date).toBe('2026-06-06')
    expect(item.source_reason).toContain('E1 duration suggestion')
    expect(item.duration_calibration_source).toBe('standard_work_duration_seed')
    expect(item.duration_provenance).toBe('standard_work_duration_seed')
    expect(item.seed_versions?.[0]).toEqual(expect.objectContaining({
      dateSource: 'duration_suggestion_e1',
    }))
  })

  it('does not fill missing draft dates from a production-day suggestion without an authoritative calendar', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-calendar-unavailable',
        project_id: 'project-1',
        title: 'Missing end date without calendar identity',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1-calendar-unavailable', {
          contextualReferenceDays: 6,
          durationOutputCode: 'contextual_reference',
          confidenceLevel: 'medium',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
        }],
      ]),
      constructionCalendar: {
        basis: 'calendar_day',
        windows: [],
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        availability: 'unavailable',
        unavailableReason: 'calendar_identity_missing',
      },
    } as any)

    expect(item.planned_start_date).toBe('2026-06-01')
    expect(item.planned_end_date).toBeNull()
    expect(item.source_reason).not.toContain('E1 duration suggestion')
  })

  it('does not fill missing draft dates from naked recommended duration under an authoritative calendar', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-naked-recommended',
        project_id: 'project-1',
        title: 'Missing end date with naked recommendation',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1-naked-recommended', {
          recommendedDurationDays: 6,
          durationOutputCode: 'contextual_reference',
          confidenceLevel: 'medium',
        }],
      ]),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    } as any)

    expect(item.planned_end_date).toBeNull()
    expect(item.source_reason).not.toContain('E1 duration suggestion')
  })

  it('does not fill missing draft dates from a raw remaining forecast alias', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-raw-remaining',
        project_id: 'project-1',
        title: 'Missing end date with raw remaining forecast',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1-raw-remaining', {
          remainingForecastDays: 999,
          durationOutputCode: 'remaining_forecast',
          confidenceLevel: 'medium',
        }],
      ]),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    } as any)

    expect(item.planned_end_date).toBeNull()
    expect(item.source_reason).not.toContain('E1 duration suggestion')
  })

  it.each([
    {
      label: 'unavailable',
      remainingDuration: {
        value: null,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-06-01',
        availability: 'unavailable',
        unavailableReason: 'duration_value_missing',
      },
    },
    {
      label: 'calendar identity mismatch',
      remainingDuration: {
        value: 3,
        unit: 'construction_production_day',
        calendarRef: 'other_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '2026-06-01',
        availability: 'available',
        unavailableReason: null,
      },
    },
    {
      label: 'invalid asOf',
      remainingDuration: {
        value: 3,
        unit: 'construction_production_day',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        asOf: '',
        availability: 'available',
        unavailableReason: null,
      },
    },
  ])('does not fall back to raw remaining duration when the typed fact is $label', ({ remainingDuration }) => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-invalid-typed-remaining',
        project_id: 'project-1',
        title: 'Missing end date with invalid governed remaining duration',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1-invalid-typed-remaining', {
          durationOutputCode: 'remaining_forecast',
          remainingForecastDays: 999,
          remainingDuration,
          confidenceLevel: 'medium',
        }],
      ]),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    } as any)

    expect(item.planned_end_date).toBeNull()
    expect(item.source_reason).not.toContain('E1 duration suggestion')
  })

  it('fills missing draft dates from a typed remaining duration with matching calendar identity', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-typed-remaining',
        project_id: 'project-1',
        title: 'Missing end date with governed remaining duration',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      durationSuggestionByTaskId: new Map([
        ['task-e1-typed-remaining', {
          durationOutputCode: 'remaining_forecast',
          remainingDuration: {
            value: 3,
            unit: 'construction_production_day',
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            asOf: '2026-06-01',
            availability: 'available',
            unavailableReason: null,
          },
          confidenceLevel: 'medium',
        }],
      ]),
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    } as any)

    expect(item.planned_start_date).toBe('2026-06-01')
    expect(item.planned_end_date).toBe('2026-06-03')
    expect(item.source_reason).toContain('E1 duration suggestion')
  })

  it('fills E1 missing draft dates with construction production days instead of raw calendar days', () => {
    const [item] = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-e1-calendar',
        project_id: 'project-1',
        title: 'Missing end date during Spring Festival shutdown',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-02-13',
        planned_end_date: null,
      } as any,
    ], [], new Set(), {
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [
          {
            holidayCode: 'spring_festival',
            holidayName: '春节',
            startDate: '2026-02-14',
            endDate: '2026-02-20',
            countsAsConstructionShutdown: true,
          },
        ],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
      durationSuggestionByTaskId: new Map([
        ['task-e1-calendar', {
          contextualReferenceDays: 3,
          durationOutputCode: 'contextual_reference',
          confidenceLevel: 'medium',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
        }],
      ]),
    } as any)

    expect(item.planned_start_date).toBe('2026-02-13')
    expect(item.planned_end_date).toBe('2026-02-22')
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      date_source: 'duration_suggestion_e1',
      source_priority: ['actual_execution', 'task_duration_forecast_e2', 'duration_suggestion_e1', 'current_schedule'],
      confidence: 'medium',
      override_level: 'system_suggested',
      calendar_basis: 'official_construction_calendar_seed',
      applied_factors: expect.arrayContaining([
        expect.objectContaining({
          factor: 'construction_calendar',
          source: 'resolveConstructionCalendarContext',
          basis: 'official_construction_calendar_seed',
        }),
      ]),
    }))
  })

  it('adds structured provenance metadata for actual, E2, E1, and current schedule date sources', () => {
    const items = buildGeneratedBaselineItemsFromTasksV1474([
      {
        id: 'task-actual',
        project_id: 'project-1',
        title: 'Actual done',
        status: 'completed',
        progress: 100,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-02',
        actual_end_date: '2026-05-06',
      },
      {
        id: 'task-e2-provenance',
        project_id: 'project-1',
        title: 'E2 in progress',
        status: 'in_progress',
        progress: 40,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-10',
        actual_start_date: '2026-05-03',
      },
      {
        id: 'task-current',
        project_id: 'project-1',
        title: 'Current schedule',
        status: 'todo',
        progress: 0,
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-05',
      },
    ] as any, [], new Set(), {
      forecastByTaskId: new Map([
        ['task-e2-provenance', {
          forecast_finish_date: '2026-05-18',
          remaining_duration_days: 12,
          confidence_level: 'high',
          duration_calibration_source: 'e2_runtime_forecast',
          duration_provenance: 'task_duration_forecast_service',
        }],
      ]),
    } as any)

    expect(items.find((item) => item.source_task_id === 'task-actual')?.generation_metadata).toEqual(expect.objectContaining({
      date_source: 'actual_execution',
      confidence: 'high',
      override_level: 'fact_anchor',
      applied_factors: expect.arrayContaining([
        expect.objectContaining({ factor: 'actual_execution_anchor' }),
      ]),
    }))
    expect(items.find((item) => item.source_task_id === 'task-e2-provenance')?.generation_metadata).toEqual(expect.objectContaining({
      date_source: 'task_duration_forecast_e2',
      confidence: 'high',
      override_level: 'forecast_adjusted',
      applied_factors: expect.arrayContaining([
        expect.objectContaining({ factor: 'task_duration_forecast_e2' }),
      ]),
    }))
    expect(items.find((item) => item.source_task_id === 'task-current')?.generation_metadata).toEqual(expect.objectContaining({
      date_source: 'current_schedule',
      confidence: 'medium',
      override_level: 'none',
      applied_factors: expect.arrayContaining([
        expect.objectContaining({ factor: 'current_schedule_dates' }),
      ]),
    }))
  })

  it('reschedules baseline draft items after B2 anchoring through the E3 critical path engine', async () => {
    mocks.buildProjectCriticalPathSnapshot.mockResolvedValueOnce({
      projectId: 'project-1',
      autoTaskIds: ['task-predecessor', 'task-successor'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-predecessor', 'task-successor'],
      watchedTaskIds: [],
      edges: [
        {
          id: 'dep-1',
          fromTaskId: 'task-predecessor',
          toTaskId: 'task-successor',
          source: 'dependency',
          isPrimary: true,
          dependencyType: 'FS',
          lagDays: 0,
        },
      ],
      tasks: [
        {
          taskId: 'task-predecessor',
          title: 'Actual predecessor',
          floatDays: 0,
          durationDays: 3,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
          chainIndex: 0,
        },
        {
          taskId: 'task-successor',
          title: 'Successor',
          floatDays: 2,
          durationDays: 2,
          isAutoCritical: false,
          isManualAttention: false,
          isManualInserted: false,
        },
      ],
      projectDurationDays: 5,
      calculationStatus: 'fresh',
      networkLineage: {
        criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
        taskNetworkInputHash: 'hash-tasks',
        dependencyInputHash: 'hash-deps',
        criticalPathInputHash: 'hash-input',
        criticalSetHash: 'hash-critical',
        dependencyRuleVersion: 'v1.4.7.4',
        baselineVersionIds: [],
        baselineItemIds: [],
        baselineVersionSource: 'task_rows',
      },
    })

    const items = await __baselineGenerationV1474TestHooks.rescheduleBaselineItemsWithE3NetworkOrder({
      projectId: 'project-1',
      taskRows: [
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'Successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any,
      items: buildGeneratedBaselineItemsFromTasksV1474([
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'Successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any, [], new Set()),
    })

    expect(mocks.buildProjectCriticalPathSnapshot).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-predecessor',
          planned_start_date: '2026-05-03',
          planned_end_date: '2026-05-05',
        }),
      ]),
      [],
    )
    expect(items.map((item) => item.source_task_id)).toEqual(['task-predecessor', 'task-successor'])
    expect(items[0].sort_order).toBe(0)
    expect(items[0].is_critical).toBe(true)
    expect(items[1].sort_order).toBe(1)
    expect(items[1].generation_metadata).toEqual(expect.objectContaining({
      e3_network_order: 1,
      e3_float_days: 2,
      e3_reschedule_source: 'projectCriticalPathService.buildProjectCriticalPathSnapshot',
      e3_dependency_count: 1,
    }))
  })

  it('calendarizes baseline draft dates in E3 network order after actual/E2/E1 anchoring', async () => {
    mocks.buildProjectCriticalPathSnapshot.mockResolvedValueOnce({
      projectId: 'project-1',
      autoTaskIds: ['task-predecessor', 'task-successor'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-predecessor', 'task-successor'],
      watchedTaskIds: [],
      edges: [
        {
          id: 'dep-1',
          fromTaskId: 'task-predecessor',
          toTaskId: 'task-successor',
          source: 'dependency',
          isPrimary: true,
          dependencyType: 'FS',
          lagDays: 0,
        },
      ],
      tasks: [
        { taskId: 'task-predecessor', title: 'Actual predecessor', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
        { taskId: 'task-successor', title: 'Successor', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      ],
      projectDurationDays: 5,
      calculationStatus: 'fresh',
      networkLineage: { criticalPathInputHash: 'hash-input' },
    })

    const items = await __baselineGenerationV1474TestHooks.rescheduleBaselineItemsWithE3NetworkOrder({
      projectId: 'project-1',
      taskRows: [
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'Successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any,
      items: buildGeneratedBaselineItemsFromTasksV1474([
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'Successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any, [], new Set()),
    })

    expect(items.map((item) => item.source_task_id)).toEqual(['task-predecessor', 'task-successor'])
    expect(items[0]).toMatchObject({
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-05',
    })
    expect(items[1]).toMatchObject({
      planned_start_date: '2026-05-06',
      planned_end_date: '2026-05-07',
    })
    expect(items[1].generation_metadata).toEqual(expect.objectContaining({
      e3_calendarized_start_date: '2026-05-06',
      e3_calendarized_end_date: '2026-05-07',
    }))
  })

  it('uses E3 CPM task offsets for overlapping dependency schedules instead of serial network order only', async () => {
    mocks.buildProjectCriticalPathSnapshot.mockResolvedValueOnce({
      projectId: 'project-1',
      autoTaskIds: ['task-predecessor', 'task-successor'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-predecessor', 'task-successor'],
      watchedTaskIds: [],
      edges: [
        {
          id: 'dep-ss-2',
          fromTaskId: 'task-predecessor',
          toTaskId: 'task-successor',
          source: 'dependency',
          isPrimary: true,
          dependencyType: 'SS',
          lagDays: 2,
        },
      ],
      tasks: [
        {
          taskId: 'task-predecessor',
          title: 'Actual predecessor',
          floatDays: 0,
          durationDays: 3,
          earliestStartOffsetDays: 0,
          earliestFinishOffsetDays: 3,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
          chainIndex: 0,
        },
        {
          taskId: 'task-successor',
          title: 'SS successor',
          floatDays: 0,
          durationDays: 2,
          earliestStartOffsetDays: 2,
          earliestFinishOffsetDays: 4,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
          chainIndex: 1,
        },
      ],
      networkSchedule: [
        { taskId: 'task-predecessor', earliestStartOffsetDays: 0, earliestFinishOffsetDays: 3, latestStartOffsetDays: 0, latestFinishOffsetDays: 3, floatDays: 0, durationDays: 3 },
        { taskId: 'task-successor', earliestStartOffsetDays: 2, earliestFinishOffsetDays: 4, latestStartOffsetDays: 2, latestFinishOffsetDays: 4, floatDays: 0, durationDays: 2 },
      ],
      projectDurationDays: 4,
      calculationStatus: 'fresh',
      networkLineage: { criticalPathInputHash: 'hash-input' },
    })

    const items = await __baselineGenerationV1474TestHooks.rescheduleBaselineItemsWithE3NetworkOrder({
      projectId: 'project-1',
      taskRows: [
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'SS successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any,
      items: buildGeneratedBaselineItemsFromTasksV1474([
        {
          id: 'task-successor',
          project_id: 'project-1',
          title: 'SS successor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Actual predecessor',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-12',
          actual_start_date: '2026-05-03',
          actual_end_date: '2026-05-05',
          sort_order: 2,
        },
      ] as any, [], new Set()),
    })

    expect(items.map((item) => item.source_task_id)).toEqual(['task-predecessor', 'task-successor'])
    expect(items[0]).toMatchObject({
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-05',
    })
    expect(items[1]).toMatchObject({
      planned_start_date: '2026-05-05',
      planned_end_date: '2026-05-06',
    })
    expect(items[1].generation_metadata).toEqual(expect.objectContaining({
      e3_cpm_earliest_start_offset_days: 2,
      e3_calendarized_start_date: '2026-05-05',
      e3_calendarized_policy: 'cpm_offset_workday_layout_after_b2_anchor',
    }))
  })

  it('does not let E3 CPM offsets rewrite baseline dates anchored to actual execution facts', async () => {
    mocks.buildProjectCriticalPathSnapshot.mockResolvedValueOnce({
      projectId: 'project-1',
      autoTaskIds: ['task-predecessor', 'task-actual'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-predecessor', 'task-actual'],
      watchedTaskIds: [],
      edges: [
        {
          id: 'dep-actual',
          fromTaskId: 'task-predecessor',
          toTaskId: 'task-actual',
          source: 'dependency',
          isPrimary: true,
          dependencyType: 'FS',
          lagDays: 0,
        },
      ],
      tasks: [
        { taskId: 'task-predecessor', title: 'Predecessor', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
        { taskId: 'task-actual', title: 'Completed actual work', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      ],
      networkSchedule: [
        { taskId: 'task-predecessor', earliestStartOffsetDays: 0, earliestFinishOffsetDays: 2, latestStartOffsetDays: 0, latestFinishOffsetDays: 2, floatDays: 0, durationDays: 2 },
        { taskId: 'task-actual', earliestStartOffsetDays: 3, earliestFinishOffsetDays: 6, latestStartOffsetDays: 3, latestFinishOffsetDays: 6, floatDays: 0, durationDays: 3 },
      ],
      projectDurationDays: 6,
      calculationStatus: 'fresh',
      networkLineage: { criticalPathInputHash: 'hash-actual-anchor' },
    })

    const items = await __baselineGenerationV1474TestHooks.rescheduleBaselineItemsWithE3NetworkOrder({
      projectId: 'project-1',
      taskRows: [
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Predecessor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-actual',
          project_id: 'project-1',
          title: 'Completed actual work',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-20',
          planned_end_date: '2026-05-22',
          actual_start_date: '2026-05-10',
          actual_end_date: '2026-05-12',
          sort_order: 2,
        },
      ] as any,
      items: buildGeneratedBaselineItemsFromTasksV1474([
        {
          id: 'task-predecessor',
          project_id: 'project-1',
          title: 'Predecessor',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-02',
          sort_order: 1,
        },
        {
          id: 'task-actual',
          project_id: 'project-1',
          title: 'Completed actual work',
          status: 'completed',
          progress: 100,
          planned_start_date: '2026-05-20',
          planned_end_date: '2026-05-22',
          actual_start_date: '2026-05-10',
          actual_end_date: '2026-05-12',
          sort_order: 2,
        },
      ] as any, [], new Set()),
    })

    const actualItem = items.find((item) => item.source_task_id === 'task-actual')
    expect(actualItem).toMatchObject({
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-12',
    })
    expect(actualItem?.generation_metadata).toEqual(expect.objectContaining({
      date_source: 'actual_execution',
      e3_calendarized_policy: 'actual_execution_anchor_preserved',
      e3_calendarized_start_date: '2026-05-10',
      e3_calendarized_end_date: '2026-05-12',
    }))
  })

  it('preserves production-day duration when E3 reschedules rows across shutdown calendars', async () => {
    mocks.buildProjectCriticalPathSnapshot.mockResolvedValueOnce({
      projectId: 'project-1',
      autoTaskIds: ['task-shutdown-span'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-shutdown-span'],
      watchedTaskIds: [],
      edges: [],
      tasks: [
        {
          taskId: 'task-shutdown-span',
          title: 'Shutdown-spanning work',
          floatDays: 0,
          durationDays: 3,
          earliestStartOffsetDays: 29,
          earliestFinishOffsetDays: 32,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
          chainIndex: 0,
        },
      ],
      networkSchedule: [
        {
          taskId: 'task-shutdown-span',
          earliestStartOffsetDays: 29,
          earliestFinishOffsetDays: 32,
          latestStartOffsetDays: 29,
          latestFinishOffsetDays: 32,
          floatDays: 0,
          durationDays: 3,
        },
      ],
      projectDurationDays: 32,
      calculationStatus: 'fresh',
      networkLineage: { criticalPathInputHash: 'hash-shutdown' },
    })

    const constructionCalendar = {
      basis: 'official_construction_calendar_seed',
      windows: [
        {
          holidayCode: 'local_shutdown',
          holidayName: 'Local shutdown',
          startDate: '2026-05-03',
          endDate: '2026-05-04',
          countsAsConstructionShutdown: true,
        },
      ],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    } satisfies ConstructionCalendarContext
    const items = await __baselineGenerationV1474TestHooks.rescheduleBaselineItemsWithE3NetworkOrder({
      projectId: 'project-1',
      taskRows: [
        {
          id: 'task-shutdown-span',
          project_id: 'project-1',
          title: 'Shutdown-spanning work',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-05',
          sort_order: 1,
        },
      ] as any,
      items: [
        {
          source_task_id: 'task-shutdown-span',
          title: 'Shutdown-spanning work',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-05',
          sort_order: 1,
          generation_metadata: {},
        },
      ],
      constructionCalendar,
    })

    expect(items[0]).toMatchObject({
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-03',
    })
    expect(items[0].generation_metadata).toEqual(expect.objectContaining({
      e3_calendarized_duration_days: 3,
      e3_calendarized_start_date: '2026-06-01',
      e3_calendarized_end_date: '2026-06-03',
    }))
  })

  it('passes project generation facts into v1.4.7.4 building-pattern seed context', () => {
    const context = __baselineGenerationV1474TestHooks.buildTaskSeedScopeContext({
      id: 'task-1',
      title: 'standard floor concrete pouring',
      project_id: 'project-1',
      building_object_id: 'building-2',
      floor_object_id: 'floor-12',
      physical_zone_object_id: null,
      section_object_id: null,
      engineering_object_id: null,
      participant_unit_id: 'unit-1',
      acceptance_required: true,
      material_required: false,
      standard_work_code: '02-01-03-P04',
      standard_task_metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'shear_wall',
          methodVariantCodes: ['aluminum_formwork'],
          elementVariantCodes: ['slab'],
        },
      },
    } as any, {
      projectGenerationFacts: {
        businessType: 'residential',
        structureTypeCode: 'shear_wall',
        methodVariantCodes: ['aluminum_formwork'],
        elementVariantCodes: ['slab'],
      },
    })

    expect(context).toEqual(expect.objectContaining({
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['aluminum_formwork'],
      elementVariantCodes: ['slab'],
      scopeDimensions: expect.arrayContaining(['building', 'floor']),
      rhythmDrivers: expect.arrayContaining(['floor_count', 'method_variant', 'resource_capacity', 'acceptance_gate']),
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      expansionStrategy: 'floor_ordered',
    }))
  })

  it('bridges title weak standard work into process constraint seed context for baseline generation', async () => {
    const weakSpy = vi.spyOn(algorithmSeedResolver, 'inferTitleWeakStandardWorkMatchesFromResolver').mockResolvedValue([{
      standardWorkCode: 'electrical_feeder_busway',
      score: 0.74,
      ruleId: 'alias_cable_tray',
    } as any])
    const durationSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeed').mockResolvedValue({
      stableCode: 'electrical_feeder_busway',
      standardCatalogCodePrefixes: ['07-03'],
      __stableCode: 'electrical_feeder_busway',
      __resolverSource: 'ts_seed_fallback',
    } as any)

    const context = await __baselineGenerationV1474TestHooks.buildProcessConstraintSeedContext({
      id: 'task-weak',
      project_id: 'project-1',
      title: '3F cable tray before feeder cable pull',
      template_node_id: null,
      standard_work_code: null,
      standard_task_metadata: {},
    } as any, {}, { projectId: 'project-1' }, '3F cable tray before feeder cable pull')

    expect(context).toMatchObject({
      standardWorkCode: 'electrical_feeder_busway',
      standardWorkCodes: ['electrical_feeder_busway'],
      standardWorkSource: 'title_weak_fallback',
      titleWeakScore: 0.74,
      titleWeakRuleId: 'alias_cable_tray',
      standardCatalogCodePrefixes: ['07-03'],
    })

    weakSpy.mockRestore()
    durationSpy.mockRestore()
  })

  it('uses projectGenerationFacts snapshot as baseline seed context input', () => {
    const context = __baselineGenerationV1474TestHooks.buildTaskSeedScopeContext({
      id: 'task-1',
      project_id: 'project-1',
      title: 'Low-rise frame masonry',
      standard_task_metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          structureTypeCode: 'frame',
          methodVariantCodes: ['cast_in_situ'],
          buildingPatternCodes: ['multi_building_parallel_flow'],
        },
      },
    } as any, {
      projectGenerationFacts: {
        businessType: 'residential',
        structureTypeCode: 'frame',
        methodVariantCodes: ['cast_in_situ'],
        buildingPatternCodes: ['multi_building_parallel_flow'],
      },
    })

    expect(context).toEqual(expect.objectContaining({
      projectTypeCode: 'residential',
      structureTypeCode: 'frame',
      methodVariantCodes: ['cast_in_situ'],
    }))
  })

  it('surfaces v1.4.7.4 duration seed factors in baseline generation metrics', async () => {
    mockSupabaseRows({
      task_duration_forecasts: [
        {
          task_id: 'task-1',
          forecast_delay_days: 3,
          confidence_level: 'medium',
          factor_summary: {
            factors: [
              { key: 'workflow_sequence', source: 'v1.4.7.4_seed' },
              { key: 'resource_conflict', source: 'v1.4.7.4_seed' },
              { key: 'progress_velocity', source: 'project_history' },
            ],
          },
          is_current: true,
          generated_at: '2026-05-17T00:00:00.000Z',
        },
        {
          task_id: 'task-1',
          forecast_delay_days: 1,
          confidence_level: 'low',
          factor_summary: {
          factors: [
              { key: 'old_factor', source: 'v1.4.7.4_seed' },
          ],
          },
          is_current: false,
          generated_at: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [
        {
          id: 'item-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-03',
          source_task_id: 'task-1',
        } as any,
      ],
      candidateItems: [
        {
          id: 'item-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-06',
          source_task_id: 'task-1',
        } as any,
      ],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Concrete pour',
          status: 'in_progress',
          progress: 40,
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(mocks.forecastBatchTasks).not.toHaveBeenCalled()
    expect(candidate.metrics.durationSeedFactorCount).toBe(2)
    expect(candidate.generationSummary.durationSeedFactorCount).toBe(2)
    expect(candidate.metrics.forecastDelayedCount).toBe(1)
  })

  it('emits Gregorian calendar-day facts for baseline date movement across a valid leap day', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([])
    mockSupabaseRows({})

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-leap',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [
        {
          id: 'milestone-1',
          title: 'Leap-day milestone',
          source_milestone_id: 'milestone-1',
          planned_start_date: '2024-02-29',
          planned_end_date: '2024-02-29',
          is_milestone: true,
        } as any,
      ],
      candidateItems: [
        {
          id: 'milestone-1',
          title: 'Leap-day milestone',
          source_milestone_id: 'milestone-1',
          planned_start_date: '2024-03-01',
          planned_end_date: '2024-03-01',
          is_milestone: true,
        } as any,
      ],
      taskRows: [],
      asOf: '2024-03-01',
    })

    expect(candidate.metrics.totalFinishShift).toEqual({
      value: 1,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2024-03-01',
      availability: 'available',
      unavailableReason: null,
    })
    expect(candidate.metrics.milestoneMaxShift).toEqual(candidate.metrics.totalFinishShift)
    expect(candidate.metrics.totalFinishShiftDays).toBe(1)
    expect(candidate.metrics.milestoneMaxShiftDays).toBe(1)
  })

  it('keeps valid same-day baseline movement available with a zero value', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([])
    mockSupabaseRows({})

    const item = {
      id: 'milestone-same-day',
      title: 'Same-day milestone',
      source_milestone_id: 'milestone-same-day',
      planned_start_date: '2024-02-29',
      planned_end_date: '2024-02-29',
      is_milestone: true,
    } as any
    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-same-day',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [item],
      candidateItems: [{ ...item }],
      taskRows: [],
      asOf: '2024-02-29',
    })

    expect(candidate.metrics.totalFinishShift).toMatchObject({
      value: 0,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    })
    expect(candidate.metrics.milestoneMaxShift).toMatchObject({
      value: 0,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    })
    expect(candidate.metrics.totalFinishShiftDays).toBe(0)
    expect(candidate.metrics.milestoneMaxShiftDays).toBe(0)
  })

  it.each([
    ['invalid', '2026-02-30'],
    ['missing', null],
  ])('fails baseline date movement facts closed when a required date is %s', async (_label, candidateEndDate) => {
    mocks.forecastBatchTasks.mockResolvedValue([])
    mockSupabaseRows({})

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-invalid-date',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [
        {
          id: 'milestone-1',
          title: 'Invalid milestone',
          source_milestone_id: 'milestone-1',
          planned_end_date: '2026-02-28',
          is_milestone: true,
        } as any,
      ],
      candidateItems: [
        {
          id: 'milestone-1',
          title: 'Invalid milestone',
          source_milestone_id: 'milestone-1',
          planned_end_date: candidateEndDate,
          is_milestone: true,
        } as any,
      ],
      taskRows: [],
      asOf: '2026-03-02',
    })

    expect(candidate.metrics.totalFinishShift).toMatchObject({
      value: null,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'unavailable',
      unavailableReason: 'duration_value_missing',
    })
    expect(candidate.metrics.milestoneMaxShift).toMatchObject({
      value: null,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'unavailable',
      unavailableReason: 'duration_value_missing',
    })
    expect(candidate.metrics.totalFinishShiftDays).toBeNull()
    expect(candidate.metrics.milestoneMaxShiftDays).toBeNull()
    expect(candidate.dataQualityReasons.join(' ')).toContain('date movement')
  })

  it('feeds project fact inputs into baseline candidate metrics and reasons', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([])
    mockSupabaseRows({
      task_dependencies: [
        { id: 'dep-1', project_id: 'project-1', task_id: 'task-1', dependency_task_id: 'task-0', dependency_type: 'FS', required_for_start: true, source_type: 'manual', status: 'active' },
      ],
      task_conditions: [
        { id: 'condition-1', project_id: 'project-1', task_id: 'task-1', condition_name: 'Drawing approval', is_satisfied: false, blocking_level: 'blocked', status: 'pending' },
      ],
      task_obstacles: [
        { id: 'obstacle-1', project_id: 'project-1', task_id: 'task-1', status: 'active', severity: 'critical', blocking_level: 'blocked' },
      ],
      project_key_node_snapshots: [
        { id: 'key-node-1', project_id: 'project-1', source_task_ids: ['task-1'], key_node_type: 'milestone', display_label: 'Top-out milestone' },
      ],
      project_entity_links: [
        { id: 'link-drawing', project_id: 'project-1', source_entity_type: 'construction_drawing', source_entity_id: 'drawing-1', target_entity_type: 'task', target_entity_id: 'task-1', status: 'active' },
        { id: 'link-material', project_id: 'project-1', source_entity_type: 'project_material', source_entity_id: 'material-1', target_entity_type: 'task', target_entity_id: 'task-1', status: 'active' },
      ],
      project_materials: [
        { id: 'material-1', project_id: 'project-1', requires_sample_confirmation: true, sample_confirmed: false, requires_inspection: false, expected_arrival_date: '2026-01-01' },
      ],
      acceptance_plans: [
        { id: 'acceptance-1', project_id: 'project-1', task_id: 'task-1', status: 'submitted' },
      ],
      risks: [
        { id: 'risk-1', project_id: 'project-1', task_id: 'task-1', status: 'identified', level: 'high' },
      ],
      issues: [
        { id: 'issue-1', project_id: 'project-1', task_id: 'task-1', status: 'open', severity: 'critical' },
      ],
      notifications: [
        {
          id: 'warning-1',
          project_id: 'project-1',
          task_id: 'task-1',
          source_entity_type: 'warning',
          type: 'critical_path_delay',
          category: 'critical_path_delay',
          severity: 'critical',
          title: 'Critical path delay',
          content: 'Task is delayed on the critical path',
          warning_lifecycle_status: 'active',
          status: 'active',
          first_seen_at: '2026-05-17T00:00:00.000Z',
          created_at: '2026-05-17T00:00:00.000Z',
        },
      ],
      monthly_plan_items: [
        { id: 'monthly-1', project_id: 'project-1', source_task_id: 'task-1', commitment_status: 'carried_over', carryover_from_item_id: 'monthly-0' },
      ],
      project_daily_snapshot: [
        { project_id: 'project-1', snapshot_date: '2026-05-17', business_health_score: 60, deviation_summary: { delayed_tasks: 1 }, health_confidence_flag: 'high' },
      ],
      projects: [
        { id: 'project-1', health_score: 60, health_status: 'warning', overall_progress: 40 },
      ],
    })

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [
        {
          id: 'item-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-03',
          source_task_id: 'task-1',
        } as any,
      ],
      candidateItems: [
        {
          id: 'item-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-06',
          source_task_id: 'task-1',
        } as any,
      ],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Concrete pour',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-06',
          status: 'in_progress',
          progress: 40,
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics).toMatchObject({
      dependencyEdgeCount: 1,
      requiredDependencyCount: 1,
      unsatisfiedConditionCount: 1,
      blockingConditionCount: 1,
      activeObstacleCount: 1,
      blockingObstacleCount: 1,
      keyNodeSnapshotCount: 1,
      keyNodeImpactedTaskCount: 1,
      drawingLinkCount: 1,
      materialLinkCount: 1,
      materialAttentionCount: 1,
      acceptancePendingCount: 1,
      openRiskCount: 1,
      openIssueCount: 1,
      activeWarningCount: 1,
      criticalExternalSignalCount: 3,
      monthlyCommitmentCount: 1,
      monthlyCarryoverCount: 1,
      healthRiskSignalCount: 2,
    })
    expect(candidate.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'dependency_graph_input',
        'key_node_snapshot_input',
        'start_condition_obstacle_input',
        'execution_linkage_input',
        'risk_issue_warning_input',
        'monthly_fulfillment_input',
        'health_deviation_input',
      ]),
    )
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('warnings')
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('notifications')
  })

  it('directly consumes workflow, building pattern and source-backed resource class seeds', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([])

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [
        {
          id: 'item-1',
          title: 'Residential tower masonry plaster A',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          source_task_id: 'task-1',
        } as any,
        {
          id: 'item-2',
          title: 'Residential tower masonry plaster B',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          source_task_id: 'task-2',
        } as any,
      ],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'Residential tower masonry plaster A',
          description: 'Residential tower masonry to plaster workflow',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-1',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
        {
          id: 'task-2',
          project_id: 'project-1',
          title: 'Residential tower masonry plaster B',
          description: 'Residential tower masonry to plaster workflow',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-1',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics.workflowSeedMatchCount).toBe(0)
    expect(candidate.metrics.buildingPatternSeedMatchCount).toBeGreaterThanOrEqual(2)
    expect(candidate.metrics.buildingPatternControlChainCount).toBeGreaterThanOrEqual(1)
    expect(candidate.metrics.buildingPatternDurationCurveProfileCount).toBeGreaterThanOrEqual(1)
    expect(candidate.metrics.buildingPatternWeightedCycleDayCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.buildingPatternWeightedMidFloorsDaysAvg).toBeGreaterThan(0)
    expect(candidate.generationSummary.buildingPatternPriorityAvg).toBeGreaterThan(0)
    expect(candidate.generationSummary.constructionRhythmExpansionCandidateCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmWorkfaceCandidateCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmStrategyCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmArbitrationSignalCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmCandidateDurationContextSignalCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(candidate.generationSummary.constructionRhythmDurationContextCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(candidate.reasons.map((reason) => reason.code)).toContain('construction_rhythm_arbitration')
    expect(candidate.reasons.map((reason) => reason.code)).toContain('construction_rhythm_coordination')
    expect(candidate.metrics.resourceClassSeedMatchCount).toBeGreaterThanOrEqual(2)
    expect(candidate.metrics.resourceConflictSeedCount).toBe(0)
    expect(candidate.metrics.directSeedSignalCount).toBeGreaterThanOrEqual(2)
    expect(candidate.businessReasons.join(' ')).toContain('building rhythm')
  })

  it('counts zone-scoped resource capacity conflicts from source-backed resource class limits', async () => {
    mocks.forecastBatchTasks.mockResolvedValue([])

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'basement concrete pour A',
          standard_work_code: '01-02-01-P01',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-a',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
        {
          id: 'task-2',
          project_id: 'project-1',
          title: 'basement concrete pour B',
          standard_work_code: '01-02-01-P02',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-2',
          physical_zone_object_id: 'zone-a',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics.resourceClassSeedMatchCount).toBe(2)
    expect(candidate.metrics.resourceConflictSeedCount).toBeGreaterThanOrEqual(1)
    expect(candidate.reasons.map((reason) => reason.code)).toContain('v1474_resource_conflict_seed')
  })

  it('prefers task metadata cross-item workflow facts for baseline lag accounting', async () => {
    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'masonry plaster follow-up',
          description: 'cross-item workflow fact',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-1',
          standard_task_metadata: {
            crossItemWorkflow: [
              {
                ruleCode: 'masonry_to_plaster_finish',
                dependencyType: 'FS',
                lagDays: 3,
                scopeRule: 'same_floor',
              },
            ],
          },
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics.workflowSeedMatchCount).toBe(1)
    expect(candidate.metrics.workflowLagDayCount).toBe(3)
    expect(candidate.generationSummary.workflowSeedMatchCount).toBe(1)
    expect((candidate.generationSummary as any).workflowLagDayCount).toBe(3)
    expect(candidate.businessReasons.join(' ')).toContain('workflow sequence')
  })

  it('keeps workflow dictionary fallback out of baseline runtime metrics', async () => {
    const workflowSignalSpy = vi.spyOn(algorithmSeedResolver, 'resolveWorkflowSequenceSignal').mockResolvedValue({
      stableCode: 'masonry_to_plaster',
      runtimeRole: 'recognition_signal',
      governanceTarget: 'workflow_dictionary',
      keywordFallbackOnly: true,
      canCreateDependencies: false,
      lagDays: 4,
      defaultLagDays: 4,
      __resolverSource: 'ts_seed_fallback',
    } as any)
    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'masonry plaster fallback',
          description: 'workflow dictionary fallback only',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          building_object_id: 'building-1',
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })
    workflowSignalSpy.mockRestore()

    expect(workflowSignalSpy).toHaveBeenCalledTimes(0)
    expect(candidate.metrics.workflowSeedMatchCount).toBe(0)
    expect(candidate.metrics.workflowLagDayCount).toBe(0)
    expect(candidate.generationSummary.workflowSeedMatchCount).toBe(0)
    expect((candidate.generationSummary as any).workflowLagDayCount).toBe(0)
  })

  it('does not count naked recommended duration as a usable missing-date suggestion', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      recommendedDurationDays: 97,
      contextualReferenceDays: null,
      confidenceLevel: 'medium',
    })

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'missing plan date task',
          planned_start_date: null,
          planned_end_date: null,
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics.missingPlanDateCount).toBe(1)
    expect(candidate.metrics.suggestedDurationCount).toBe(0)
    expect(candidate.generationSummary.missingPlanDateCount).toBe(1)
    expect(candidate.generationSummary.suggestedDurationCount).toBe(0)
  })

  it('does not count legacy snake_case duration output aliases as usable missing-date suggestions', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      duration_output_code: 'contextual_reference',
      duration_output_semantic_field_name: 'contextualReferenceDays',
      contextual_reference_days: 97,
      plan_reference_days: 97,
      remaining_forecast_days: 97,
      confidenceLevel: 'medium',
    })

    const candidate = await buildBaselineGenerationCandidateV1474({
      baseline: {
        id: 'baseline-1',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
      } as any,
      sourceItems: [],
      candidateItems: [],
      taskRows: [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'missing plan date task',
          planned_start_date: null,
          planned_end_date: null,
          status: 'todo',
          is_executable: true,
          is_wbs_summary: false,
        } as any,
      ],
    })

    expect(candidate.metrics.missingPlanDateCount).toBe(1)
    expect(candidate.metrics.suggestedDurationCount).toBe(0)
    expect(candidate.generationSummary.missingPlanDateCount).toBe(1)
    expect(candidate.generationSummary.suggestedDurationCount).toBe(0)
  })
})
