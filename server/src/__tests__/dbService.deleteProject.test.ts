import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const calls: Array<{ table: string; column: string; value: string }> = []

  const buildDeleteQuery = (table: string) => ({
    eq: vi.fn(async (column: string, value: string) => {
      calls.push({ table, column, value })
      return { error: null }
    }),
  })

  const from = vi.fn((table: string) => ({
    delete: vi.fn(() => buildDeleteQuery(table)),
  }))

  return {
    calls,
    from,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: state.from,
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('dbService deleteProject', () => {
  beforeEach(() => {
    state.calls.length = 0
    state.from.mockClear()
  })

  it('cleans task-linked rows before deleting the project itself', async () => {
    const { deleteProject } = await import('../services/dbService.js')

    await deleteProject('project-1')

    expect(state.calls).toEqual([
      { table: 'task_conditions', column: 'project_id', value: 'project-1' },
      { table: 'task_obstacles', column: 'project_id', value: 'project-1' },
      { table: 'risks', column: 'project_id', value: 'project-1' },
      { table: 'issues', column: 'project_id', value: 'project-1' },
      { table: 'tasks', column: 'project_id', value: 'project-1' },
      { table: 'task_timeline_events', column: 'project_id', value: 'project-1' },
      { table: 'projects', column: 'id', value: 'project-1' },
    ])
  })
})
