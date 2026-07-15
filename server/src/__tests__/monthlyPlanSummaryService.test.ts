import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

const {
  getMonthlyPlanFulfillmentTrend,
  evaluateMonthlyPlanConfirmationReadiness,
  getMonthlyPlanStatusSummary,
} = await import('../services/monthlyPlanSummaryService.js')
const { getMetricRegistryEntry } = await import('../services/metricRegistryService.js')

describe('monthlyPlanSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rawQuery.mockReset()
    mocks.supabaseFrom.mockReset()
  })

  it('normalizes monthly fulfillment trend from the summary SQL outlet', async () => {
    mocks.rawQuery.mockResolvedValue({
      rows: [
        { month: '2026-04', committed_count: 4, fulfilled_count: 3 },
        { month: '2026-05', committed_count: 0, fulfilled_count: 0 },
      ],
    })

    await expect(getMonthlyPlanFulfillmentTrend('project-1', 6)).resolves.toEqual([
      { month: '2026-04', committedCount: 4, fulfilledCount: 3, rate: 75 },
      { month: '2026-05', committedCount: 0, fulfilledCount: 0, rate: 0 },
    ])
    expect(mocks.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('monthly_plan_items'),
      ['project-1', ['confirmed', 'closed'], 6, ['completed', 'done', 'finished']],
    )
  })

  it('publishes confirm and closeout counters from the same summary service', async () => {
    mocks.rawQuery.mockResolvedValue({
      rows: [
        {
          confirmed_count: 2,
          closed_count: 1,
          pending_closeout_count: 3,
          temporary_without_baseline_count: 4,
        },
      ],
    })

    await expect(getMonthlyPlanStatusSummary('project-1')).resolves.toEqual({
      confirmedCount: 2,
      closedCount: 1,
      pendingCloseoutCount: 3,
      temporaryWithoutBaselineCount: 4,
    })
    expect(mocks.rawQuery).toHaveBeenCalledWith(expect.stringContaining('monthly_plans'), ['project-1'])
  })

  it('falls back to zero counters when the status summary SQL outlet is unavailable', async () => {
    mocks.rawQuery.mockRejectedValueOnce(new Error('column "pending_closeout_count" does not exist'))

    await expect(getMonthlyPlanStatusSummary('project-1')).resolves.toEqual({
      confirmedCount: 0,
      closedCount: 0,
      pendingCloseoutCount: 0,
      temporaryWithoutBaselineCount: 0,
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[monthlyPlanSummaryService] direct status summary query failed, using zero fallback',
      expect.objectContaining({ projectId: 'project-1' }),
    )
  })

  it('scores whether a generated monthly plan can be confirmed directly or needs manual review', () => {
    const result = evaluateMonthlyPlanConfirmationReadiness([
      {
        commitment_status: 'planned',
        manual_override_fields: {},
        generation_metadata: {
          confidence: 'high',
          algorithm_context: {
            e2_confidence_level: 'high',
            monthly_capacity_budget_days: 20,
            monthly_capacity_demand_days: 16,
            monthly_capacity_allocated_days: 16,
            monthly_readiness_pool: 'committable',
          },
        },
      },
      {
        commitment_status: 'planned',
        manual_override_fields: { target_progress: true },
        generation_metadata: {
          confidence: 'low',
          algorithm_context: {
            e2_confidence_level: 'low',
            monthly_capacity_budget_days: 20,
            monthly_capacity_demand_days: 34,
            monthly_capacity_allocated_days: 15,
            monthly_readiness_pool: 'backup',
          },
        },
      },
    ] as any)

    expect(result).toMatchObject({
      recommendation: 'manual_review_required',
      score: 57,
      factors: {
        dataCompletenessScore: 50,
        e2ConfidenceScore: 50,
        capacityLoadScore: 68,
        unresolvedBlockerScore: 50,
        manualOverrideScore: 50,
        historicalFulfillmentScore: 85,
      },
      signals: {
        itemCount: 2,
        lowConfidenceItemCount: 1,
        backupItemCount: 1,
        manualOverrideItemCount: 1,
        capacityOverloadRate: 0.38,
      },
      reviewReasons: expect.arrayContaining([
        'monthly_plan_has_low_confidence_items',
        'monthly_plan_contains_backup_readiness_items',
        'monthly_plan_capacity_overloaded',
        'monthly_plan_has_manual_overrides',
      ]),
    })
  })

  it('registers monthly plan confirmation readiness metrics in the shared registry', () => {
    expect(getMetricRegistryEntry('monthly_plan_confirmation_readiness_score')).toEqual(expect.objectContaining({
      source: 'monthlyPlanSummaryService',
      dataType: 'number',
      defaultGranularity: 'month',
    }))
    expect(getMetricRegistryEntry('monthly_plan_manual_review_required_count')).toEqual(expect.objectContaining({
      source: 'monthlyPlanSummaryService',
      dataType: 'count',
      defaultGranularity: 'month',
    }))
  })
})
