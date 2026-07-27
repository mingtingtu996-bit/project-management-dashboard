import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    durationExperienceSamples: [] as Row[],
    projectDailySnapshot: [] as Row[],
    projectScheduleStates: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'project_daily_snapshot') return state.projectDailySnapshot
    if (table === 'project_schedule_states') return state.projectScheduleStates
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    return []
  }

  function applyFilters(rows: Row[], filters: Row[]) {
    return filters.reduce((result, filter) => {
      if (filter.type === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Row[] = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ type: 'eq', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({
        data: applyFilters(rowsFor(table), filters)[0] ?? null,
        error: null,
      })),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        return Promise.resolve({
          data: applyFilters(rowsFor(table), filters),
          error: null,
        }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const { buildProjectProductivityCompensation } = await import('../services/projectProductivityCompensationService.js')

function makeDurationSamples(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `sample-${index + 1}`,
    project_id: 'project-1',
    task_id: `task-${index + 1}`,
    planned_duration: 10,
    actual_duration: 8,
    sample_status: 'active',
    included_in_benchmark: true,
    sample_strength: 'strong',
    confidence_level: 'high',
    completed_at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }))
}

function makeSnapshots(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    project_id: 'project-1',
    snapshot_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    overall_progress: index,
    delay_days: Math.max(0, 45 - index),
    active_obstacle_count: Math.max(0, 8 - Math.floor(index / 10)),
    pending_condition_count: Math.max(0, 6 - Math.floor(index / 12)),
    active_risk_count: Math.max(0, 5 - Math.floor(index / 20)),
    critical_path_affected_tasks: index > 20 ? 0 : 2,
  }))
}

describe('projectProductivityCompensationService', () => {
  beforeEach(() => {
    mocks.state.durationExperienceSamples = []
    mocks.state.projectDailySnapshot = []
    mocks.state.projectScheduleStates = []
    mocks.state.projectProductivityCalibrations = []
    mocks.from.mockClear()
  })

  it('keeps cold-start projects observation-only and does not inflate 综合 P', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(8)
    mocks.state.projectDailySnapshot = makeSnapshots(10)

    const compensation = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact'],
    })

    expect(compensation).toEqual(expect.objectContaining({
      actionPolicy: 'confidence_only',
      productivityUplift: 0,
      adjustedProductivity: 0.71,
      notAppliedReason: 'cold_start_observation_only',
      maturityTier: 'cold_start',
    }))
  })

  it('applies bounded productivity compensation after 90 days of real execution evidence', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(60)
    mocks.state.projectDailySnapshot = makeSnapshots(100)
    mocks.state.projectScheduleStates = [{
      project_id: 'project-1',
      scope_type: 'building',
      scope_id: 'building-2',
      state: 'accelerating',
      confidence_score: 0.86,
      window_days: 14,
      window_end_date: '2026-04-10',
      local_acceleration_factor: 0.93,
      throughput_ratio: 1.55,
      parallel_density_ratio: 1.2,
      deviation_recovery_days: 5,
      evidence: [],
      downstream_policy: {
        canAdjustRemainingDuration: true,
        canExplainDeviation: true,
        canRelaxResourceConflictPenalty: true,
        velocityFactorSupersedes: true,
        resourceConflictPenaltyMultiplier: 0.65,
        localAccelerationFactor: 0.93,
        maxForwardDays: 14,
        confidenceOnly: false,
        actionPolicy: 'candidate_only',
      },
      metrics: { criticalPathThroughputRatio: 1.5, milestoneThroughputRatio: 1.35, standardFloorThroughputRatio: 1.42 },
    }]

    const compensation = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      scopeIds: ['building-2'],
      appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact', 'resource_conflict'],
    })

    expect(compensation).toEqual(expect.objectContaining({
      actionPolicy: 'auto_apply',
      maturityTier: 'mature_90d',
      adjustedProductivity: expect.any(Number),
      durationMultiplier: expect.any(Number),
      notAppliedReason: null,
    }))
    expect(compensation.adjustedProductivity).toBeGreaterThanOrEqual(0.76)
    expect(compensation.adjustedProductivity).toBeLessThanOrEqual(0.89)
    expect(compensation.productivityUplift).toBeLessThanOrEqual(0.18)
    expect(compensation.sourceBreakdown.map((source) => source.key)).toContain('resequencing')
    expect(compensation.sourceBreakdown.map((source) => source.key)).not.toContain('crew_learning')
    expect(mocks.from).not.toHaveBeenCalledWith('duration_experience_samples')
  })

  it('uses only explicitly governed shadow replay samples as crew learning evidence', async () => {
    const compensation = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      appliedFactorKeys: ['progress_velocity'],
      governanceMode: 'learning_shadow_replay',
      skipPublishedCalibrationOverlay: true,
      shadowEvidence: {
        durationSamples: makeDurationSamples(60),
        dailySnapshots: makeSnapshots(100),
        scheduleStates: [],
      },
    })

    expect(compensation.metadata.durationExperience).toEqual(expect.objectContaining({
      averageEfficiency: 1.25,
      source: 'governed_learning_shadow_replay',
      durationRatio: 0.8,
    }))
    expect(compensation.sourceBreakdown.find((source) => source.key === 'crew_learning')).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        durationRatio: 0.8,
        source: 'governed_learning_shadow_replay',
      }),
    }))
    expect(compensation.dataDependencies).toContain('duration_experience_samples')
    expect(mocks.from).not.toHaveBeenCalledWith('duration_experience_samples')
  })

  it('applies only published calibration overlays and preserves maturity caps', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(60)
    mocks.state.projectDailySnapshot = makeSnapshots(100)
    mocks.state.projectProductivityCalibrations = [{
      id: 'calibration-1',
      project_id: 'project-1',
      calibration_key: 'productivity_compensation',
      status: 'published',
      published_at: '2026-04-20T00:00:00.000Z',
      recommended_cap: 0.06,
      recommended_min_uplift: 0.05,
      parameter_payload: {
        sampleCount: 60,
        snapshotCount: 100,
        maturityDays: 90,
        compensationCap: 0.06,
        minAppliedUplift: 0.05,
        maxAdjustedProductivity: 0.95,
        sourceWeightScale: {
          durationExperience: 0.5,
          dailySnapshot: 1,
          scheduleState: 1,
        },
      },
      evidence_summary: { windowDays: 90 },
    }]

    const compensation = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact'],
    })

    expect(compensation.notAppliedReason).toBeNull()
    expect(compensation.compensationCap).toBe(0.06)
    expect(compensation.productivityUplift).toBeLessThanOrEqual(0.06)
    expect(compensation.metadata).toEqual(expect.objectContaining({
      publishedCalibrationApplied: true,
      publishedCalibrationId: 'calibration-1',
    }))
    expect(compensation.metadata.publishedCalibrationPolicy).toEqual(expect.objectContaining({
      compensationCap: 0.06,
      sourceWeightScale: expect.objectContaining({ durationExperience: 0.5 }),
    }))
  })

  it('can skip published overlays during shadow backtests to avoid self-reinforcing calibration drift', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(60)
    mocks.state.projectDailySnapshot = makeSnapshots(100)
    mocks.state.projectProductivityCalibrations = [{
      id: 'calibration-1',
      project_id: 'project-1',
      calibration_key: 'productivity_compensation',
      status: 'published',
      recommended_cap: 0.05,
      parameter_payload: {
        compensationCap: 0.05,
        sourceWeightScale: { durationExperience: 0.4, dailySnapshot: 0.4, scheduleState: 0.4 },
      },
      evidence_summary: {},
    }]

    const runtime = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact'],
    })
    const shadowBacktest = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact'],
      skipPublishedCalibrationOverlay: true,
    })

    expect(runtime.metadata.publishedCalibrationApplied).toBe(true)
    expect(shadowBacktest.metadata.publishedCalibrationApplied).toBe(false)
    expect(shadowBacktest.productivityUplift).toBeGreaterThanOrEqual(runtime.productivityUplift)
  })

  it('does not compensate rigid shutdown windows or matching blocked schedule states', async () => {
    mocks.state.durationExperienceSamples = makeDurationSamples(60)
    mocks.state.projectDailySnapshot = makeSnapshots(100)
    mocks.state.projectScheduleStates = [{
      project_id: 'project-1',
      scope_type: 'specialty',
      scope_id: 'mep',
      state: 'blocked',
      confidence_score: 0.8,
      window_days: 14,
      window_end_date: '2026-04-10',
      local_acceleration_factor: null,
      throughput_ratio: 0.6,
      parallel_density_ratio: 1.1,
      deviation_recovery_days: -4,
      evidence: [],
      downstream_policy: {
        canAdjustRemainingDuration: false,
        canExplainDeviation: true,
        canRelaxResourceConflictPenalty: false,
        velocityFactorSupersedes: false,
        resourceConflictPenaltyMultiplier: 1,
        localAccelerationFactor: null,
        maxForwardDays: 0,
        confidenceOnly: false,
        actionPolicy: 'candidate_only',
      },
      metrics: {},
    }]

    const springFestival = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.4,
      calendarKind: 'spring_festival',
      appliedFactorKeys: ['seasonal_productivity'],
    })
    const blocked = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.71,
      scopeIds: ['mep'],
      appliedFactorKeys: ['seasonal_productivity', 'resource_conflict'],
    })

    expect(springFestival.notAppliedReason).toBe('rigid_shutdown_window_not_compensated')
    expect(springFestival.adjustedProductivity).toBe(0.4)
    expect(blocked.notAppliedReason).toBe('blocking_schedule_state_present')
    expect(blocked.adjustedProductivity).toBe(0.71)
  })

  it('does not use project-level recovery compensation to offset zero-progress remobilization blockers', async () => {
    mocks.state.durationExperienceSamples = Array.from({ length: 70 }, (_, index) => ({
      id: `sample-remobilization-${index + 1}`,
      task_id: `task-remobilization-${index + 1}`,
      planned_duration: 10,
      actual_duration: 8,
      included_in_benchmark: true,
      sample_status: 'active',
      sample_strength: 'strong',
      confidence_level: 'high',
      completed_at: `2028-11-${String((index % 28) + 1).padStart(2, '0')}`,
    }))
    mocks.state.projectDailySnapshot = Array.from({ length: 120 }, (_, index) => ({
      project_id: 'project-1',
      snapshot_date: new Date(Date.UTC(2028, 7, index + 1)).toISOString().slice(0, 10),
      overall_progress: index,
      delay_days: Math.max(0, 30 - index),
      active_obstacle_count: Math.max(0, 6 - Math.floor(index / 12)),
      pending_condition_count: Math.max(0, 5 - Math.floor(index / 15)),
    }))

    const compensation = await buildProjectProductivityCompensation({
      projectId: 'project-1',
      baseProductivity: 0.64,
      month: 2,
      appliedFactorKeys: ['external_readiness', 'weather_forecast_impact', 'resource_conflict'],
      currentProgress: 0,
      shutdownSignals: ['post_festival_labor_remobilization', 'velocity_skipped_due_to_zero_progress'],
    })

    expect(compensation.notAppliedReason).toBe('rigid_shutdown_window_not_compensated')
    expect(compensation.adjustedProductivity).toBe(0.64)
    expect(compensation.productivityUplift).toBe(0)
  })
})
