import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
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
  query: vi.fn(),
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
})
