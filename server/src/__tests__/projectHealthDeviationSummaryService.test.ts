import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => {
  const tables = {
    project_daily_snapshot: [] as Row[],
    projects: [] as Row[],
    task_duration_forecasts: [] as Row[],
  }

  function buildQuery(table: keyof typeof tables) {
    const filters: Array<(row: Row) => boolean> = []
    let orderColumn: string | null = null
    let ascending = true
    let limitCount: number | null = null

    const materialize = () => {
      let rows = [...tables[table]].filter((row) => filters.every((filter) => filter(row)))
      if (orderColumn) {
        rows.sort((left, right) => {
          const leftValue = String(left[orderColumn!] ?? '')
          const rightValue = String(right[orderColumn!] ?? '')
          return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
        })
      }
      if (typeof limitCount === 'number') rows = rows.slice(0, limitCount)
      return rows
    }

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column
        ascending = options?.ascending !== false
        return query
      }),
      limit: vi.fn((value: number) => {
        limitCount = value
        return query
      }),
      maybeSingle: vi.fn(async () => ({ data: materialize()[0] ?? null, error: null })),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }
    return query
  }

  return {
    tables,
    from: vi.fn((table: keyof typeof tables) => buildQuery(table)),
    logger: {
      error: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

import { buildProjectHealthDeviationSummary } from '../services/projectHealthDeviationSummaryService.js'

describe('projectHealthDeviationSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.project_daily_snapshot.splice(0, mocks.tables.project_daily_snapshot.length)
    mocks.tables.projects.splice(0, mocks.tables.projects.length)
    mocks.tables.task_duration_forecasts.splice(0, mocks.tables.task_duration_forecasts.length)
  })

  it('explains duration deviation with site capacity pressure facts without creating business issues', async () => {
    mocks.tables.project_daily_snapshot.push({
      project_id: 'project-1',
      snapshot_date: '2026-05-19',
      business_health_score: 76,
      health_confidence_score: 81,
      health_confidence_flag: 'medium',
      health_basis: { progress: 60 },
      deviation_summary: { delayedTasks: 2 },
      health_caliber_version: 'v1.4.19',
    })
    mocks.tables.projects.push({
      id: 'project-1',
      health_score: 78,
      health_status: '预警',
      overall_progress: 62,
    })
    mocks.tables.task_duration_forecasts.push({
      project_id: 'project-1',
      task_id: 'task-1',
      is_current: true,
      generated_at: '2026-05-19T08:00:00.000Z',
      forecast_delay_days: 5,
      factor_summary: {
        factors: [{
          key: 'resource_conflict',
          reason: '同责任单位在同楼栋任务集中，现场承载压力偏高。',
          metadata: {
            resourceObstacleCount: 1,
            overdueMaterialCount: 1,
            sameResponsibleUnitCount: 1,
          },
        }],
      },
    })

    const summary = await buildProjectHealthDeviationSummary('project-1')

    expect(summary.deviationSummary).toEqual(expect.objectContaining({
      delayedTasks: 2,
      durationDeviationCauses: [
        expect.objectContaining({
          code: 'resource_conflict',
          label: '现场承载压力',
          count: 1,
          maxDelayDays: 5,
          reasons: expect.arrayContaining([
            '同责任单位在同楼栋任务集中，现场承载压力偏高。',
            '资源类阻碍未解除',
            '关联材料到货逾期',
            '同责任单位任务集中',
          ]),
        }),
      ],
    }))
  })

  it('prefers latest snapshot health fields and falls back to persisted project health', async () => {
    mocks.tables.project_daily_snapshot.push({
      project_id: 'project-1',
      snapshot_date: '2026-05-20',
      health_score: 71,
      health_status: '亚健康',
      business_health_score: null,
      health_confidence_score: 66,
      health_confidence_flag: 'medium',
      health_basis: {},
      deviation_summary: {},
      health_caliber_version: 'v1.4.19',
    })
    mocks.tables.projects.push({
      id: 'project-1',
      health_score: 52,
      health_status: '预警',
      overall_progress: 62,
    })

    const summary = await buildProjectHealthDeviationSummary('project-1')

    expect(summary.healthScore).toBe(71)
    expect(summary.healthStatus).toBe('亚健康')
    expect(summary.businessHealthScore).toBe(71)
  })

  it('uses persisted project health when snapshot health fields are absent', async () => {
    mocks.tables.project_daily_snapshot.push({
      project_id: 'project-1',
      snapshot_date: '2026-05-20',
      health_basis: {},
      deviation_summary: {},
      health_caliber_version: 'v1.4.19',
    })
    mocks.tables.projects.push({
      id: 'project-1',
      health_score: 52,
      health_status: '预警',
      overall_progress: 62,
    })

    const summary = await buildProjectHealthDeviationSummary('project-1')

    expect(summary.healthScore).toBe(52)
    expect(summary.healthStatus).toBe('预警')
    expect(summary.businessHealthScore).toBe(52)
  })
})
