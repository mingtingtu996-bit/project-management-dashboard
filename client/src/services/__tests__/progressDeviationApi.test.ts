import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
}))

const {
  getProgressDeviationAnalysis,
  normalizeProgressDeviationAnalysis,
} = await import('../progressDeviationApi')

const availableProductionDuration = (value: number) => ({
  value,
  unit: 'construction_production_day',
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  asOf: '2026-07-20',
  availability: 'available',
  unavailableReason: null,
})

describe('progressDeviationApi duration facts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes production-day facts without deriving from deprecated numeric fields', () => {
    const normalized = normalizeProgressDeviationAnalysis({
      project_id: 'project-1',
      baseline_version_id: 'baseline-v1',
      summary: {
        total_items: 1,
        deviated_items: 1,
        carryover_items: 0,
        unresolved_items: 0,
        baseline_items: 0,
        monthly_plan_items: 0,
        execution_items: 1,
      },
      rows: [{
        id: 'row-1',
        title: '施工任务',
        mainline: 'execution',
        deviation_days: 99,
        deviation_duration: availableProductionDuration(4),
        deviation_rate: 12,
        status: 'delayed',
        attribution: {
          cause_chain: [{
            id: 'cause-1',
            cause_type: 'dependency_wait',
            reason: '等待上游',
            affected_task_id: 'task-1',
            impacted_owner: 'Owner B',
            accountable_owner: 'Owner A',
            responsibility_basis: 'upstream_dependency',
            evidence_source: 'forecast',
            impact_days: 99,
            impact_duration: availableProductionDuration(4),
            evidence: {
              wait_days: 99,
              wait_duration: availableProductionDuration(3),
            },
          }],
        },
      }],
      mainlines: [],
      trend_events: [],
      chart_data: {
        baselineDeviation: [],
        monthlyFulfillment: [],
        executionDeviation: [{
          id: 'row-1',
          title: '施工任务',
          mainline: 'execution',
          deviation_days: 99,
          deviation_duration: availableProductionDuration(4),
          deviation_rate: 12,
          status: 'delayed',
        }],
        monthly_buckets: [],
      },
      responsibility_contribution: [{
        owner: 'Owner A',
        count: 1,
        percentage: 100,
        task_ids: ['task-1'],
        impact_days: 99,
        impact_duration: availableProductionDuration(4),
      }],
    })

    expect(normalized?.rows[0]?.deviation_duration).toMatchObject({
      value: 4,
      unit: 'construction_production_day',
      availability: 'available',
    })
    expect(normalized?.rows[0]?.attribution?.cause_chain?.[0]?.impact_duration?.value).toBe(4)
    expect(normalized?.rows[0]?.attribution?.cause_chain?.[0]?.evidence?.wait_duration?.value).toBe(3)
    expect(normalized?.chart_data?.executionDeviation?.[0]?.deviation_duration?.value).toBe(4)
    expect(normalized?.responsibility_contribution?.[0]?.impact_duration?.value).toBe(4)
  })

  it('fails closed when production-day calendar identity is missing', () => {
    const normalized = normalizeProgressDeviationAnalysis({
      project_id: 'project-1',
      baseline_version_id: 'baseline-v1',
      summary: {},
      rows: [{
        id: 'row-1',
        title: '施工任务',
        mainline: 'execution',
        deviation_days: 88,
        deviation_duration: {
          ...availableProductionDuration(4),
          calendarRef: null,
        },
        deviation_rate: 12,
        status: 'delayed',
        attribution: {
          delay_reasons: [{
            impact_days: 88,
            impact_duration: {
              ...availableProductionDuration(3),
              calendarVersion: null,
            },
          }],
        },
      }],
      mainlines: [],
      trend_events: [],
    })

    expect(normalized?.rows[0]?.deviation_duration).toBeNull()
    expect(normalized?.rows[0]?.attribution?.delay_reasons?.[0]?.impact_duration).toBeNull()
    expect(normalized?.rows[0]).not.toHaveProperty('deviationDuration')
  })

  it('fetches and normalizes the governed progress-deviation response', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      project_id: 'project-1',
      baseline_version_id: 'baseline-v1',
      summary: {},
      rows: [{
        id: 'row-1',
        title: '施工任务',
        mainline: 'execution',
        deviation_days: 77,
        deviation_duration: availableProductionDuration(5),
        deviation_rate: 8,
        status: 'delayed',
      }],
      mainlines: [],
      trend_events: [],
    })

    const result = await getProgressDeviationAnalysis('project-1', 'baseline-v1', { signal: undefined })

    expect(result?.rows[0]?.deviation_duration?.value).toBe(5)
    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/progress-deviation?project_id=project-1&baseline_version_id=baseline-v1',
      { signal: undefined },
    )
  })
})
