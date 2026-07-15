import { afterEach, describe, expect, it, vi } from 'vitest'

import { runWithDatabaseTransactionClient } from '../database.js'
import { writeChangeLog } from '../services/changeAuditService.js'
import { supabase } from '../services/dbService.js'

describe('change audit transaction context', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the audit record on the active transaction connection', async () => {
    const statements: Array<{ sql: string; params?: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        statements.push({ sql: String(sql), params })
        return { rows: [], rowCount: 1 }
      }),
      release: vi.fn(),
    }
    vi.spyOn(supabase, 'from').mockImplementation(() => {
      throw new Error('Supabase REST must not write audit rows inside a transaction')
    })

    await runWithDatabaseTransactionClient(client, async () => {
      await expect(writeChangeLog({
        projectId: 'project-1',
        entityType: 'task_list',
        entityId: 'project-1',
        actionType: 'task_list_commit',
        changedBy: 'user-1',
        metadata: { operationCount: 2 },
      })).resolves.toEqual(expect.any(String))
    })

    const insert = statements.find(({ sql }) => sql.includes('INSERT INTO public.change_logs'))
    expect(insert).toBeDefined()
    expect(insert?.sql).not.toMatch(/\bcreated_at\b/)
    expect(insert?.params).toHaveLength(19)
    expect(insert?.params?.[6]).toBe('task_list_commit')
    expect(insert?.params).toEqual(expect.arrayContaining(['project-1', 'task_list', 'task_list_commit']))
  })
})
