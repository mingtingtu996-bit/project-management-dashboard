import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const query = vi.fn(async (_sql: string, _params?: any[]) => ({ rows: [] }))
  const upsert = vi.fn(async () => ({ error: null }))
  const insert = vi.fn(async () => ({ error: null }))
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  }))
  const from = vi.fn(() => ({
    upsert,
    insert,
    select,
  }))

  return {
    query,
    from,
    upsert,
    insert,
    select,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: state.from,
  })),
}))

vi.mock('../database.js', () => ({
  isDatabaseTransactionActive: vi.fn(() => false),
  query: state.query,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('dbService recordTaskProgressSnapshot', () => {
  beforeEach(() => {
    delete process.env.DB_SQL_EXECUTION_MODE
    state.query.mockClear()
    state.from.mockClear()
    state.upsert.mockClear()
    state.insert.mockClear()
    state.select.mockClear()
  })

  it('normalizes Date updated_at values to a stable snapshot_date', async () => {
    const { recordTaskProgressSnapshot } = await import('../services/dbService.js')

    await recordTaskProgressSnapshot({
      id: 'task-date-snapshot',
      project_id: '',
      updated_at: new Date('2026-06-21T08:30:00.000Z'),
      progress: 35,
      status: 'in_progress',
    })

    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: 'task-date-snapshot',
        snapshot_date: '2026-06-21',
        progress: 35,
      }),
      expect.objectContaining({
        onConflict: 'task_id,snapshot_date,event_type,event_source',
      }),
    )
  })

  it('uses direct SQL and derives planning lineage from physical task item anchors in worker mode', async () => {
    process.env.DB_SQL_EXECUTION_MODE = 'direct'
    const { recordTaskProgressSnapshot } = await import('../services/dbService.js')

    await recordTaskProgressSnapshot({
      id: 'task-direct-snapshot',
      project_id: '',
      updated_at: '2026-08-06T08:30:00.000Z',
      progress: 45,
      status: 'in_progress',
      baseline_item_id: '11111111-1111-4111-8111-111111111111',
      monthly_plan_item_id: '22222222-2222-4222-8222-222222222222',
    })

    expect(state.query).toHaveBeenCalledTimes(1)
    const [sql, params] = state.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO public.task_progress_snapshots')
    expect(sql).toContain('LEFT JOIN public.task_baseline_items')
    expect(sql).toContain('LEFT JOIN public.monthly_plan_items')
    expect(sql).toContain('created_at = EXCLUDED.created_at')
    expect(params).toEqual(expect.arrayContaining([
      'task-direct-snapshot',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]))
    expect(params[20]).toBe('monthly_plan')
    expect(state.upsert).not.toHaveBeenCalled()
  })

  it('flushes deferred project effects once and keeps their database work sequential', async () => {
    const dbService = await import('../services/dbService.js')
    expect(dbService.flushTaskProgressSnapshotProjectSideEffects).toBeTypeOf('function')

    const calls: string[] = []
    let active = 0
    let maxActive = 0
    const run = async (name: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      calls.push(name)
      active -= 1
    }
    dbService.registerDbServiceBusinessSideEffectAdapters({
      enqueueProjectHealthUpdate: () => run('health'),
      syncProjectDataQuality: () => run('data-quality'),
    })

    await dbService.flushTaskProgressSnapshotProjectSideEffects('project-batch', 'task_reconciled')

    expect(calls).toEqual(['health', 'data-quality'])
    expect(maxActive).toBe(1)
  })
})
