import { afterEach, describe, expect, it, vi } from 'vitest'

import { runWithDatabaseTransactionClient } from '../database.js'
import { deleteTask, executeSQL, getTask, supabase } from '../services/dbService.js'

describe('dbService transaction context', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes executeSQL and task reads through the active PostgreSQL transaction', async () => {
    const statements: Array<{ sql: string; params?: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        statements.push({ sql: String(sql), params })
        if (String(sql).includes('SELECT * FROM tasks WHERE id = $1')) {
          return { rows: [{ id: 'task-1', project_id: 'project-1', version: 1 }], rowCount: 1 }
        }
        if (String(sql).includes('SELECT COUNT(*) AS total FROM tasks')) {
          return { rows: [{ total: 2 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      }),
      release: vi.fn(),
    }
    vi.spyOn(supabase, 'from').mockImplementation(() => {
      throw new Error('Supabase REST must not run inside a database transaction')
    })

    await runWithDatabaseTransactionClient(client, async () => {
      await expect(getTask('task-1')).resolves.toMatchObject({ id: 'task-1' })
      await expect(executeSQL<{ total: number }>(
        'SELECT COUNT(*) AS total FROM tasks WHERE project_id = ?',
        ['project-1'],
      )).resolves.toEqual([{ total: 2 }])
    })

    expect(statements.some(({ sql }) => sql.includes('project_id = $1'))).toBe(true)
  })

  it('executes task deletion RPC on the active transaction connection', async () => {
    const statements: string[] = []
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(String(sql))
        if (String(sql).includes('SELECT * FROM tasks WHERE id = $1')) {
          return { rows: [{ id: 'task-1', project_id: 'project-1', version: 1 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      }),
      release: vi.fn(),
    }
    vi.spyOn(supabase, 'rpc').mockImplementation(() => {
      throw new Error('Supabase RPC must not run inside a database transaction')
    })

    await runWithDatabaseTransactionClient(client, async () => {
      await deleteTask('task-1')
    })

    expect(statements).toContain('SELECT public.delete_task_with_source_backfill_atomic($1)')
  })
})
