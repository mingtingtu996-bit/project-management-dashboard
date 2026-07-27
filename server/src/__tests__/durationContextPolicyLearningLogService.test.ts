import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { op: 'eq' | 'lte' | 'gte'; column: string; value: any }

const mocks = vi.hoisted(() => {
  const state = {
    policyDecisions: [] as Row[],
    projectProductivityCalibrations: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'duration_context_policy_decisions') return state.policyDecisions
    if (table === 'project_productivity_compensation_calibrations') return state.projectProductivityCalibrations
    return []
  }

  function setRows(table: string, rows: Row[]) {
    if (table === 'duration_context_policy_decisions') state.policyDecisions = rows
    if (table === 'project_productivity_compensation_calibrations') state.projectProductivityCalibrations = rows
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
    let pendingUpdate: Row | null = null
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
      update: vi.fn((payload: Row) => {
        pendingUpdate = payload
        return builder
      }),
      insert: vi.fn((payload: Row) => {
        const rows = rowsFor(table)
        const row = { id: payload.id ?? `${table}-${rows.length + 1}`, ...payload }
        rows.push(row)
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: row, error: null })),
          })),
        }
      }),
      maybeSingle: vi.fn(() => {
        const rows = applyFilters(rowsFor(table), filters)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      }),
      single: vi.fn(() => {
        const rows = applyFilters(rowsFor(table), filters)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        if (pendingUpdate) {
          const nextRows = rowsFor(table).map((row) => (
            applyFilters([row], filters).length > 0 ? { ...row, ...pendingUpdate } : row
          ))
          setRows(table, nextRows)
          return Promise.resolve({ data: nextRows, error: null }).then(resolve, reject)
        }
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
    rawQuery: vi.fn(),
    getProjectCompanyId: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

const { buildDurationContextPolicyRecommendation } = await import('../services/durationContextPolicyLearningService.js')
const {
  backfillDurationContextPolicyRewards,
  persistDurationContextPolicyDecision,
  runDurationContextPolicyOfflineReplay,
} = await import('../services/durationContextPolicyLearningLogService.js')

function makeLowRiskRecommendation() {
  return buildDurationContextPolicyRecommendation({
    companyId: 'company-1',
    projectId: 'project-1',
    state: {
      maturityDays: 90,
      ruleBaselineP: 0.74,
      currentP: 0.82,
      scheduleState: 'accelerating',
      factorSignals: [
        { factorKey: 'productivity_compensation', multiplier: 0.94, extraDays: 0, actionPolicy: 'auto_apply' },
      ],
    },
    replayEvidence: {
      maeBefore: 0.14,
      maeAfter: 0.05,
      overcompensationRate: 0.02,
      sampleCount: 90,
    },
  })
}

describe('durationContextPolicyLearningLogService', () => {
  beforeEach(() => {
    mocks.state.policyDecisions = []
    mocks.state.projectProductivityCalibrations = []
    mocks.from.mockClear()
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [{ id: 'algorithm-offline-replay-candidate-1' }] })
    mocks.getProjectCompanyId.mockReset()
    mocks.getProjectCompanyId.mockResolvedValue('10000000-0000-4000-8000-000000000001')
  })

  it('persists contextual bandit recommendations as backend decision logs without runtime mutation', async () => {
    const recommendation = makeLowRiskRecommendation()

    const row = await persistDurationContextPolicyDecision({
      recommendation,
      decisionDate: '2026-04-01',
      targetRewardDate: '2026-05-01',
      sourceCalibrationId: 'calibration-1',
      metadata: { source: 'project_productivity_calibration' },
    })

    expect(row).toEqual(expect.objectContaining({
      company_id: 'company-1',
      project_id: 'project-1',
      model_family: 'contextual_bandit_v1',
      model_version: 'contextual_bandit_v1',
      decision_date: '2026-04-01',
      target_reward_date: '2026-05-01',
      decision_status: 'auto_publish_eligible',
      reward_status: 'pending',
      runtime_mutation_policy: 'none_decision_log_only',
      source_calibration_id: 'calibration-1',
    }))
    expect(mocks.state.policyDecisions[0]).toEqual(expect.objectContaining({
      state_vector: recommendation.stateVector,
      candidate_actions: recommendation.candidateActions,
      recommended_action: recommendation.recommendedAction,
      metadata: expect.objectContaining({ source: 'project_productivity_calibration' }),
    }))
  })

  it('backfills delayed rewards from later calibration evidence once the target reward date arrives', async () => {
    const recommendation = makeLowRiskRecommendation()
    await persistDurationContextPolicyDecision({
      recommendation,
      decisionDate: '2026-04-01',
      targetRewardDate: '2026-05-01',
      sourceCalibrationId: 'calibration-1',
    })
    mocks.state.projectProductivityCalibrations = [
      {
        id: 'calibration-2',
        project_id: 'project-1',
        status: 'candidate',
        window_end_date: '2026-05-12',
        mae_before: 0.14,
        mae_after: 0.04,
        overcompensation_rate: 0.01,
        evidence_summary: { scheduleStabilityDelta: 0.03 },
      },
    ]

    const result = await backfillDurationContextPolicyRewards({
      asOfDate: '2026-05-15',
    })

    expect(result).toEqual(expect.objectContaining({
      scanned: 1,
      evaluated: 1,
      skipped: 0,
    }))
    expect(mocks.state.policyDecisions[0]).toEqual(expect.objectContaining({
      decision_status: 'reward_evaluated',
      reward_status: 'evaluated',
      reward_source_calibration_id: 'calibration-2',
      reward_payload: expect.objectContaining({
        totalReward: expect.any(Number),
        components: expect.objectContaining({ maeImprovement: expect.any(Number) }),
      }),
    }))
    expect(mocks.state.policyDecisions[0].reward_payload.totalReward).toBeGreaterThan(0)
  })

  it('runs offline replay as a candidate report without changing published calibration rows', async () => {
    mocks.state.projectProductivityCalibrations = [
      {
        id: 'calibration-1',
        project_id: 'project-1',
        status: 'published',
        action_policy: 'auto_publish',
        window_end_date: '2026-05-30',
        maturity_days: 90,
        sample_count: 90,
        snapshot_count: 90,
        base_productivity: 0.74,
        adjusted_productivity: 0.82,
        mae_before: 0.14,
        mae_after: 0.05,
        overcompensation_rate: 0.02,
        evidence_summary: {
          compensation: {
            durationMultiplier: 0.94,
            actionPolicy: 'auto_apply',
            metadata: { dominantScheduleState: 'accelerating' },
          },
        },
      },
    ]

    const result = await runDurationContextPolicyOfflineReplay({
      windowEndDate: '2026-05-31',
    })

    expect(result).toEqual(expect.objectContaining({
      replayCode: 'duration_context_policy_offline_replay',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_candidate_report_only',
      scanned: 1,
      recommendationCount: 1,
      persistedDecisionCount: 0,
    }))
    expect(result.recommendations[0]).toEqual(expect.objectContaining({
      projectId: 'project-1',
      modelFamily: 'contextual_bandit_v1',
    }))
    expect(mocks.state.projectProductivityCalibrations[0].status).toBe('published')
    expect(mocks.state.policyDecisions).toHaveLength(0)
  })

  it('bridges persisted offline replay policy recommendations into unified governance candidate events', async () => {
    mocks.state.projectProductivityCalibrations = [
      {
        id: 'calibration-1',
        project_id: 'project-1',
        status: 'published',
        action_policy: 'auto_publish',
        window_end_date: '2026-05-30',
        maturity_days: 90,
        sample_count: 90,
        snapshot_count: 90,
        base_productivity: 0.74,
        adjusted_productivity: 0.82,
        mae_before: 0.14,
        mae_after: 0.05,
        overcompensation_rate: 0.02,
        evidence_summary: {
          compensation: {
            durationMultiplier: 0.94,
            actionPolicy: 'auto_apply',
            metadata: { dominantScheduleState: 'accelerating' },
          },
        },
      },
    ]

    const result = await runDurationContextPolicyOfflineReplay({
      windowEndDate: '2026-05-31',
      persistDecisions: true,
    })

    expect(result).toEqual(expect.objectContaining({
      recommendationCount: 1,
      persistedDecisionCount: 1,
    }))
    expect(result.recommendations[0]).toEqual(expect.objectContaining({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: 'project-1',
    }))
    expect(mocks.state.policyDecisions[0]).toEqual(expect.objectContaining({
      company_id: '10000000-0000-4000-8000-000000000001',
      project_id: 'project-1',
    }))
    expect(mocks.getProjectCompanyId).toHaveBeenCalledWith('project-1')
    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'duration.context.policy.contextual_bandit_v1.project-1',
      'durationContextPolicyLearningService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
      'candidate_only',
    ]))
  })
})
