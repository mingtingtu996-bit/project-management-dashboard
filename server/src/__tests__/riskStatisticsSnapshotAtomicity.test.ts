import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const rawQuery = vi.fn()
  return { from, rawQuery }
})

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import { riskStatisticsService } from '../services/riskStatisticsService.js'

type QueryResult = { data?: unknown; error?: unknown }

function createBuilder(result: QueryResult) {
  const builder: Record<string, any> = {}
  for (const method of ['select', 'eq', 'gte', 'lte', 'in', 'delete', 'insert', 'upsert', 'single']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  )
  return builder
}

describe('risk statistics snapshot atomicity', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.rawQuery.mockReset()
  })

  it('replaces a daily snapshot with one atomic upsert', async () => {
    const riskResults = [
      { data: [{ level: 'high', status: 'open', source_type: 'manual' }], error: null },
      { data: [], error: null },
      { data: [{ level: 'high', status: 'open', source_type: 'manual' }], error: null },
    ]
    const snapshot = {
      id: 'snapshot-1',
      project_id: 'project-1',
      stat_date: '2026-07-11',
    }
    const snapshotBuilder = createBuilder({ data: snapshot, error: null })

    mocks.from.mockImplementation((table: string) => {
      if (table === 'risks') return createBuilder(riskResults.shift() ?? { data: [], error: null })
      if (table === 'risk_statistics') return snapshotBuilder
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(
      riskStatisticsService.generateDailySnapshot('project-1', '2026-07-11'),
    ).resolves.toMatchObject(snapshot)

    expect(snapshotBuilder.delete).not.toHaveBeenCalled()
    expect(snapshotBuilder.insert).not.toHaveBeenCalled()
    expect(snapshotBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(snapshotBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        stat_date: '2026-07-11',
      }),
      { onConflict: 'project_id,stat_date' },
    )
  })

  it('rejects when a source query returns a fulfilled Supabase error', async () => {
    const sourceError = new Error('risk source unavailable')
    mocks.from.mockImplementation((table: string) => {
      if (table === 'risks') return createBuilder({ data: null, error: sourceError })
      if (table === 'risk_statistics') return createBuilder({ data: null, error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(
      riskStatisticsService.generateDailySnapshot('project-1', '2026-07-11'),
    ).rejects.toThrow('risk source unavailable')
  })

  it('reconstructs historical stock from lifecycle timestamps instead of today inventory', async () => {
    const riskResults = [
      { data: [], error: null },
      { data: [], error: null },
      {
        data: [
          {
            level: 'high',
            status: 'closed',
            source_type: 'manual',
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-12T00:00:00.000Z',
          },
          {
            level: 'medium',
            status: 'open',
            source_type: 'manual',
            created_at: '2026-07-12T00:00:00.000Z',
            updated_at: '2026-07-12T00:00:00.000Z',
          },
          {
            level: 'low',
            status: 'open',
            source_type: 'manual',
            created_at: '2026-07-13T00:00:00.000Z',
            updated_at: '2026-07-13T00:00:00.000Z',
          },
          {
            level: 'critical',
            status: 'closed',
            source_type: 'manual',
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-10T00:00:00.000Z',
          },
        ],
        error: null,
      },
    ]
    const snapshotBuilder = createBuilder({
      data: { id: 'snapshot-history', project_id: 'project-1', stat_date: '2026-07-11' },
      error: null,
    })

    mocks.from.mockImplementation((table: string) => {
      if (table === 'risks') return createBuilder(riskResults.shift() ?? { data: [], error: null })
      if (table === 'risk_statistics') return snapshotBuilder
      throw new Error(`Unexpected table: ${table}`)
    })

    await riskStatisticsService.generateDailySnapshot('project-1', '2026-07-11')

    expect(snapshotBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        total_risks: 1,
        high_risk_count: 1,
        medium_risk_count: 0,
        critical_risk_count: 0,
      }),
      { onConflict: 'project_id,stat_date' },
    )
  })

  it('rejects when the atomic upsert returns a fulfilled Supabase error', async () => {
    const upsertError = new Error('snapshot write unavailable')
    const riskResults = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]
    mocks.from.mockImplementation((table: string) => {
      if (table === 'risks') return createBuilder(riskResults.shift() ?? { data: [], error: null })
      if (table === 'risk_statistics') return createBuilder({ data: null, error: upsertError })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(
      riskStatisticsService.generateDailySnapshot('project-1', '2026-07-11'),
    ).rejects.toThrow('snapshot write unavailable')
  })
})
