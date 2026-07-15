import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeSQL, supabase } from '../services/dbService.js'

function createSelectChain(result: { data: unknown[] | null; error: null; count?: number | null }) {
  const chain: any = {
    eq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    abortSignal: vi.fn(async () => result),
  }
  return chain
}

describe('dbService SELECT semantics', () => {
  beforeEach(() => {
    vi.stubEnv('DB_SQL_EXECUTION_MODE', 'rest')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses an exact head count instead of downloading and counting rows', async () => {
    const chain = createSelectChain({ data: null, error: null, count: 1_501 })
    const select = vi.fn(() => chain)
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never)

    await expect(executeSQL<{ total: number }>(
      'SELECT COUNT(*) AS total FROM tasks WHERE project_id = ?',
      ['project-1'],
    )).resolves.toEqual([{ total: 1_501 }])

    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(chain.eq).toHaveBeenCalledWith('project_id', 'project-1')
  })

  it('preserves a simple projection and aliases instead of selecting every column', async () => {
    const rows = [{ id: 'task-1', task_title: 'Foundation' }]
    const chain = createSelectChain({ data: rows, error: null })
    const select = vi.fn(() => chain)
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never)

    await expect(executeSQL(
      'SELECT id, title AS task_title FROM tasks WHERE project_id = ?',
      ['project-1'],
    )).resolves.toEqual(rows)

    expect(select).toHaveBeenCalledWith('id,task_title:title')
  })
})
