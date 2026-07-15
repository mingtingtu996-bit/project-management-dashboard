import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { op: 'eq' | 'lte' | 'gte'; column: string; value: any }

const mocks = vi.hoisted(() => {
  const state = {
    projects: [] as Row[],
    durationExperienceSamples: [] as Row[],
    projectDailySnapshot: [] as Row[],
    policyDecisions: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'projects') return state.projects
    if (table === 'duration_experience_samples') return state.durationExperienceSamples
    if (table === 'project_daily_snapshot') return state.projectDailySnapshot
    if (table === 'duration_context_policy_decisions') return state.policyDecisions
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    return []
  }

  function applyFilters(rows: Row[], filters: Filter[]) {
    return filters.reduce((result, filter) => {
      if (filter.op === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      if (filter.op === 'lte') return result.filter((row) => String(row[filter.column] ?? '') <= String(filter.value))
      if (filter.op === 'gte') return result.filter((row) => String(row[filter.column] ?? '') >= String(filter.value))
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Filter[] = []
    let limitCount: number | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return builder
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'lte', column, value })
        return builder
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'gte', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn((count: number) => {
        limitCount = count
        return builder
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = applyFilters(rowsFor(table), filters)
        return Promise.resolve({
          data: limitCount == null ? rows : rows.slice(0, limitCount),
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

const { buildDurationContextColdStartLearningPlan } = await import('../services/durationContextColdStartLearningPlanService.js')

function pushProject(projectId: string, startDate: string) {
  mocks.state.projects.push({
    id: projectId,
    start_date: startDate,
    planned_start_date: startDate,
    created_at: `${startDate}T00:00:00.000Z`,
  })
}

function addRows(table: keyof typeof mocks.state, projectId: string, count: number, date: string, extra: Row = {}) {
  for (let index = 0; index < count; index += 1) {
    mocks.state[table].push({
      id: `${table}-${projectId}-${index}`,
      project_id: projectId,
      sample_date: date,
      snapshot_date: date,
      decision_date: date,
      window_end_date: date,
      reward_status: extra.reward_status ?? extra.rewardStatus,
      ...extra,
    })
  }
}

describe('durationContextColdStartLearningPlanService', () => {
  beforeEach(() => {
    mocks.state.projects = []
    mocks.state.durationExperienceSamples = []
    mocks.state.projectDailySnapshot = []
    mocks.state.policyDecisions = []
    mocks.state.projectProductivityCalibrations = []
    mocks.from.mockClear()
  })

  it('keeps projects with no history in shadow logging only and blocks candidate learning', async () => {
    pushProject('project-cold', '2026-05-30')

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-cold'],
      asOfDate: '2026-05-31',
    })

    expect(result).toEqual(expect.objectContaining({
      planCode: 'duration_context_cold_start_learning_plan',
      runtimeMutationPolicy: 'none_maturity_gate_report_only',
      allowedAutomationLevel: 'shadow_logging_only',
    }))
    expect(result.summary).toEqual(expect.objectContaining({
      projectCount: 1,
      readyForCandidateLearningCount: 0,
      readyForOfflineReplayCount: 0,
      readyForTrialReviewCount: 0,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    }))
    expect(result.projectPlans[0]).toEqual(expect.objectContaining({
      projectId: 'project-cold',
      maturityStage: 'day_0_shadow_logging',
      allowedAutomationLevel: 'shadow_logging_only',
      runtimeMutationPolicy: 'none_maturity_gate_report_only',
      blockedStages: expect.arrayContaining([
        'candidate_parameter_learning',
        'offline_replay',
        'canary_candidate_generation',
        'controlled_trial_review',
      ]),
    }))
  })

  it('uses the lowest common maturity as the aggregate automation gate for mixed projects', async () => {
    pushProject('project-cold', '2026-05-30')

    pushProject('project-90', '2026-03-01')
    addRows('durationExperienceSamples', 'project-90', 120, '2026-05-31')
    addRows('projectDailySnapshot', 'project-90', 90, '2026-05-31')
    addRows('policyDecisions', 'project-90', 40, '2026-05-31', { reward_status: 'evaluated' })
    addRows('projectProductivityCalibrations', 'project-90', 2, '2026-05-31', { status: 'candidate' })

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-cold', 'project-90'],
      asOfDate: '2026-05-31',
    })

    expect(result.allowedAutomationLevel).toBe('shadow_logging_only')
    expect(result.projectPlans.find((item) => item.projectId === 'project-cold')).toEqual(expect.objectContaining({
      maturityStage: 'day_0_shadow_logging',
      allowedAutomationLevel: 'shadow_logging_only',
    }))
    expect(result.projectPlans.find((item) => item.projectId === 'project-90')).toEqual(expect.objectContaining({
      maturityStage: 'day_90_controlled_trial_review',
      allowedAutomationLevel: 'controlled_trial_review_eligible',
    }))
  })

  it('opens diagnostics after 7 days of current-project evidence but still blocks candidate learning', async () => {
    pushProject('project-7', '2026-05-24')
    addRows('projectDailySnapshot', 'project-7', 7, '2026-05-31')
    addRows('policyDecisions', 'project-7', 3, '2026-05-31', { reward_status: 'pending' })

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-7'],
      asOfDate: '2026-05-31',
    })

    expect(result.allowedAutomationLevel).toBe('diagnostics_only')
    expect(result.projectPlans[0]).toEqual(expect.objectContaining({
      projectId: 'project-7',
      maturityStage: 'day_7_diagnostics',
      allowedAutomationLevel: 'diagnostics_only',
      allowedStages: expect.arrayContaining([
        'shadow_logging',
        'data_quality_diagnostics',
        'factor_attribution',
      ]),
      blockedStages: expect.arrayContaining([
        'candidate_parameter_learning',
        'offline_replay',
        'controlled_trial_review',
      ]),
    }))
  })

  it('opens candidate and replay stages only after evidence thresholds are met', async () => {
    pushProject('project-30', '2026-05-01')
    addRows('durationExperienceSamples', 'project-30', 35, '2026-05-31')
    addRows('projectDailySnapshot', 'project-30', 30, '2026-05-31')
    addRows('policyDecisions', 'project-30', 8, '2026-05-31', { reward_status: 'pending' })

    pushProject('project-60', '2026-04-01')
    addRows('durationExperienceSamples', 'project-60', 70, '2026-05-31')
    addRows('projectDailySnapshot', 'project-60', 60, '2026-05-31')
    addRows('policyDecisions', 'project-60', 15, '2026-05-31', { reward_status: 'evaluated' })
    addRows('projectProductivityCalibrations', 'project-60', 1, '2026-05-31', { status: 'candidate' })

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-30', 'project-60'],
      asOfDate: '2026-05-31',
    })

    expect(result.projectPlans.find((item) => item.projectId === 'project-30')).toEqual(expect.objectContaining({
      maturityStage: 'day_30_candidate_learning',
      allowedAutomationLevel: 'candidate_parameter_learning',
      allowedStages: expect.arrayContaining(['shadow_logging', 'candidate_parameter_learning']),
      blockedStages: expect.arrayContaining(['offline_replay', 'controlled_trial_review']),
    }))
    expect(result.projectPlans.find((item) => item.projectId === 'project-60')).toEqual(expect.objectContaining({
      maturityStage: 'day_60_shadow_replay',
      allowedAutomationLevel: 'offline_replay_and_canary_candidate_review',
      allowedStages: expect.arrayContaining(['offline_replay', 'canary_candidate_generation']),
      blockedStages: expect.arrayContaining(['controlled_trial_review']),
    }))
  })

  it('counts real duration experience date columns when sample_date is absent', async () => {
    pushProject('project-real-columns', '2026-05-01')
    for (let index = 0; index < 30; index += 1) {
      mocks.state.durationExperienceSamples.push({
        id: `duration-real-columns-${index}`,
        project_id: 'project-real-columns',
        completed_at: '2026-05-31T08:00:00.000Z',
      })
    }
    addRows('projectDailySnapshot', 'project-real-columns', 30, '2026-05-31')

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-real-columns'],
      asOfDate: '2026-05-31',
    })

    expect(result.projectPlans[0]).toEqual(expect.objectContaining({
      maturityStage: 'day_30_candidate_learning',
      allowedAutomationLevel: 'candidate_parameter_learning',
      evidence: expect.objectContaining({
        durationExperienceSampleCount: 30,
        dailySnapshotCount: 30,
      }),
    }))
  })

  it('allows controlled trial review only at mature 90 day evidence without mutating runtime', async () => {
    pushProject('project-90', '2026-03-01')
    addRows('durationExperienceSamples', 'project-90', 120, '2026-05-31')
    addRows('projectDailySnapshot', 'project-90', 90, '2026-05-31')
    addRows('policyDecisions', 'project-90', 40, '2026-05-31', { reward_status: 'evaluated' })
    addRows('projectProductivityCalibrations', 'project-90', 2, '2026-05-31', { status: 'candidate' })

    const result = await buildDurationContextColdStartLearningPlan({
      projectIds: ['project-90'],
      asOfDate: '2026-05-31',
    })

    expect(result.allowedAutomationLevel).toBe('controlled_trial_review_eligible')
    expect(result.summary.readyForTrialReviewCount).toBe(1)
    expect(result.projectPlans[0]).toEqual(expect.objectContaining({
      maturityStage: 'day_90_controlled_trial_review',
      allowedAutomationLevel: 'controlled_trial_review_eligible',
      allowedStages: expect.arrayContaining([
        'shadow_logging',
        'candidate_parameter_learning',
        'offline_replay',
        'canary_candidate_generation',
        'activation_readiness_review',
        'controlled_trial_review',
      ]),
      blockedStages: [],
    }))
  })
})
